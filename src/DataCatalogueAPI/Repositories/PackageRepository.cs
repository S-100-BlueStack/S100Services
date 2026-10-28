using S100FC;
using S100FC.S840.FeatureTypes;
using ArcGIS.Core.Data;
using ArcGIS.Core.Data.Exceptions;
using ArcGIS.Core.Geometry;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Events;
using Eventuous;
using Eventuous.Subscriptions;
using Eventuous.Subscriptions.Context;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;
using System.Text.Json;
using IO = System.IO;

namespace DataCatalague.Api.Repositories
{
    public partial class PackageRepository : IEventHandler, IAsyncDisposable
    {
        internal static readonly JsonSerializerOptions jsonSerializerOptions = new JsonSerializerOptions {
            WriteIndented = false,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            PropertyNameCaseInsensitive = true,
        };

        /// <summary>The maximum number of packages returned in a listing page.</summary>
        public const int MaximumPageSize = 200;

        private readonly ArcGisDispatcher _arcDispatcher;

        private readonly ConcurrentDictionary<string, PackageState> _packages = new(StringComparer.Ordinal);

        private readonly PipelineAssignmentIndex _assignments;

        private readonly IOptions<PackagesOptions> _options;

        private readonly ILogger<PackageRepository> _logger;

        private readonly Func<Geodatabase> createGeodatabase = () => { throw new NotImplementedException(); };

        private readonly IReadOnlyDictionary<string, FeatureClassDefinition> _featureClassDefinitions;
        private readonly IReadOnlyDictionary<string, TableDefinition> _standaloneTableDefinitions;

        public PackageRepository(ArcGisDispatcher arcDispatcher, IOptions<PackagesOptions> options, ILogger<PackageRepository> logger, PipelineAssignmentIndex assignments) {
            this._assignments = assignments;
            this._arcDispatcher = arcDispatcher ?? throw new ArgumentNullException(nameof(arcDispatcher));
            this._options = options ?? throw new ArgumentNullException(nameof(options));
            this._logger = logger ?? throw new ArgumentNullException(nameof(logger));

            var geodatabase = options.Value.Geodatabase;

            if (IO.File.Exists(geodatabase) && ".sde".Equals(IO.Path.GetExtension(geodatabase), StringComparison.OrdinalIgnoreCase)) {
                this.createGeodatabase = () => { return new Geodatabase(new DatabaseConnectionFile(new Uri(IO.Path.GetFullPath(IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, geodatabase))))); };
            }
            else if (IO.Directory.Exists(geodatabase) && ".gdb".Equals(IO.Path.GetExtension(geodatabase), StringComparison.OrdinalIgnoreCase)) {
                this.createGeodatabase = () => { return new Geodatabase(new FileGeodatabaseConnectionPath(new Uri(IO.Path.GetFullPath(IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, geodatabase))))); };
            }
            else if (".geodatabase".Equals(IO.Path.GetExtension(geodatabase), StringComparison.OrdinalIgnoreCase)) {
                this.createGeodatabase = () => {
                    return new Geodatabase(new MobileGeodatabaseConnectionPath(new Uri(IO.Path.GetFullPath(IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, geodatabase)))));
                };
            }
            else if (geodatabase.StartsWith("https://")) {
                this.createGeodatabase = () => { return new Geodatabase(new ServiceConnectionProperties(new Uri(geodatabase))); };
            }
            else
                throw new System.ArgumentOutOfRangeException(nameof(options.Value.Geodatabase));

            var definitions = arcDispatcher.ExecuteAsync(() => {
                using var connector = this.createGeodatabase();

                var syntax = connector.GetSQLSyntax();

                return (
                    connector.GetDefinitions<FeatureClassDefinition>().ToDictionary(e => syntax.ParseTableName(e.GetName()).Item3.ToLowerInvariant(), e => e),
                    connector.GetDefinitions<TableDefinition>().ToDictionary(e => syntax.ParseTableName(e.GetName()).Item3.ToLowerInvariant(), e => e));
            }).ConfigureAwait(false).GetAwaiter().GetResult();

            this._featureClassDefinitions = definitions.Item1;
            this._standaloneTableDefinitions = definitions.Item2;
        }

        /// <summary>Returns a bounded page from the subscription projection, optionally intersecting current package AOIs.</summary>
        /// <param name="category">An optional exact category identifier.</param>
        /// <param name="cancellationToken">Cancels before and between spatial rows and metadata reads.</param>
        /// <param name="geometry">Optional Esri JSON envelope or polygon with an explicit spatial reference.</param>
        /// <param name="page">One-based page number.</param>
        /// <param name="pageSize">Page size between 1 and <see cref="MaximumPageSize"/>.</param>
        /// <param name="hasPipeline">True for packages bound to at least one pipeline; false for unbound packages; null for both.</param>
        /// <param name="pipelineId">Optional exact pipeline assignment.</param>
        /// <returns>A page in ordinal catalogue identifier order and its total matching count.</returns>
        /// <exception cref="ArgumentOutOfRangeException">A paging argument is outside the supported range.</exception>
        /// <exception cref="InvalidDataException">The supplied query geometry is invalid or cannot be projected.</exception>
        public async Task<(IReadOnlyList<PackageState> Items, int TotalCount)> GetPackagesAsync(string? category, CancellationToken cancellationToken, string? geometry = null, int page = 1, int pageSize = 20, bool? hasPipeline = null, string? pipelineId = null) {
            ArgumentOutOfRangeException.ThrowIfLessThan(page, 1);
            ArgumentOutOfRangeException.ThrowIfLessThan(pageSize, 1);
            ArgumentOutOfRangeException.ThrowIfGreaterThan(pageSize, MaximumPageSize);
            cancellationToken.ThrowIfCancellationRequested();

            KeyValuePair<string, PackageState>[] candidates;
            if (geometry is null) {
                candidates = this._packages.ToArray();
            }
            else {
                var matches = await this._arcDispatcher.ExecuteAsync(() => this.FindIntersectingAois(geometry, cancellationToken));
                var resolved = new List<KeyValuePair<string, PackageState>>(matches.Count);
                foreach (var match in matches) {
                    cancellationToken.ThrowIfCancellationRequested();
                    // Replacements retain old coverage rows for event history. Only the AOI
                    // currently referenced by the subscription may contribute to the result.
                    if (this._packages.TryGetValue(match.Key, out var state) && state.GeometryRef is { } reference && match.Value.Contains(reference)) {
                        resolved.Add(new(match.Key, state));
                    }
                }
                candidates = resolved.ToArray();
            }

            cancellationToken.ThrowIfCancellationRequested();
            // Count and page use the same captured states; no event-store reads or geometry hydration.
            var matching = candidates
                .Where(item => (category is null || string.Equals(item.Value.Category?.Value, category, StringComparison.Ordinal))
                    && (hasPipeline is null || this._assignments.HasAssignments(item.Key) == hasPipeline.Value)
                    && (pipelineId is null || this._assignments.Contains(item.Key, pipelineId)))
                .OrderBy(item => item.Key, StringComparer.Ordinal)
                .ToArray();
            var offset = ((long)page - 1) * pageSize;
            IReadOnlyList<PackageState> items = offset >= matching.Length
                ? []
                : matching.Skip((int)offset).Take(pageSize).Select(item => item.Value).ToArray();
            cancellationToken.ThrowIfCancellationRequested();
            return (items, matching.Length);
        }

        private Dictionary<string, HashSet<string>> FindIntersectingAois(string json, CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            var geometry = ParseQueryGeometry(json);
            using var connector = this.createGeodatabase();
            using var featureClass = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName());
            using var definition = featureClass.GetDefinition();
            var spatialReference = definition.GetSpatialReference();
            if (spatialReference is null || spatialReference.IsUnknown) {
                throw new InvalidOperationException("The package AOI feature class must have a known spatial reference.");
            }
            try {
                if (!geometry.SpatialReference.IsEqual(spatialReference)) {
                    geometry = GeometryEngine.Instance.Project(geometry, spatialReference);
                }
                ValidateQueryGeometry(geometry);
            }
            catch (Exception exception) when (exception is ArcGIS.Core.Geometry.Exceptions.GeometryException or ArgumentException) {
                throw new InvalidDataException("The query geometry cannot be projected into the package AOI spatial reference.", exception);
            }

            var filter = new SpatialQueryFilter {
                FilterGeometry = geometry,
                SpatialRelationship = SpatialRelationship.Intersects,
                WhereClause = $"code = '{nameof(PackageCoverage)}'",
                SubFields = $"{definition.GetGlobalIDField()},attributebindings",
            };
            var matches = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            var featureClassName = featureClass.GetName().Split('.')[^1];
            cancellationToken.ThrowIfCancellationRequested();
            using var cursor = featureClass.Search(filter, false);
            while (cursor.MoveNext()) {
                using var row = cursor.Current;
                cancellationToken.ThrowIfCancellationRequested();
                // Query only IDs/bindings. The geodatabase applies the spatial index and
                // intersection; fetching shapes here would duplicate that work in memory.
                var globalId = row.GetGlobalID();
                var packageId = ReadCoveragePackageId(row["attributebindings"] as string, globalId);
                if (!matches.TryGetValue(packageId, out var references)) {
                    references = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    matches.Add(packageId, references);
                }
                references.Add($"{featureClassName}::{globalId:B}");
            }
            return matches;
        }

        private static string ReadCoveragePackageId(string? bindings, Guid globalId) {
            if (string.IsNullOrWhiteSpace(bindings)) {
                throw new InvalidOperationException($"Package coverage '{globalId:B}' has no attribute bindings.");
            }

            Exception? flattenError = null;
            try {
                var coverage = AttributeFlattenExtensions.Unflatten<PackageCoverage>(bindings, typeof(PackageCoverage));
                if (!string.IsNullOrWhiteSpace(coverage.packageId)) {
                    return coverage.packageId;
                }
            }
            catch (Exception exception) when (exception is JsonException or InvalidOperationException or ArgumentException or FormatException or NotSupportedException or System.Reflection.TargetInvocationException) {
                flattenError = exception;
            }

            // Rows created before S-840 flattening may also contain an "attr" array.
            // The legacy typed reader ignores that array without relying on dynamic JSON.
            try {
                var legacy = JsonSerializer.Deserialize<LegacyPackageCoverage>(bindings, jsonSerializerOptions);
                if (!string.IsNullOrWhiteSpace(legacy?.packageId)) {
                    return legacy.packageId;
                }
            }
            catch (JsonException exception) {
                flattenError ??= exception;
            }

            throw new InvalidOperationException($"Package coverage '{globalId:B}' has invalid or missing packageId attribute bindings.", flattenError);
        }

        private sealed class LegacyPackageCoverage
        {
            public LegacyPackageCoverage() { }

            public string? packageId { get; set; }
        }

        private static Geometry ParseQueryGeometry(string json) {
            try {
                using var document = JsonDocument.Parse(json);
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("spatialReference", out var sr) || sr.ValueKind != JsonValueKind.Object) {
                    throw new InvalidDataException("geometry must be an Esri JSON envelope or polygon with an explicit spatialReference.");
                }
                var hasWkid = sr.TryGetProperty("wkid", out var wkid) && wkid.ValueKind == JsonValueKind.Number && wkid.TryGetInt32(out var value) && value > 0;
                var hasWkt = sr.TryGetProperty("wkt", out var wkt) && wkt.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(wkt.GetString());
                if (!hasWkid && !hasWkt) {
                    throw new InvalidDataException("geometry.spatialReference must contain a positive wkid or a nonempty wkt.");
                }

                Geometry geometry;
                if (root.TryGetProperty("rings", out _) || root.TryGetProperty("curveRings", out _)) {
                    geometry = PolygonBuilderEx.FromJson(json);
                }
                else {
                    // Check the raw bounds before ArcGIS can normalize an inverted envelope.
                    var bounds = new double[4];
                    string[] names = ["xmin", "ymin", "xmax", "ymax"];
                    for (var index = 0; index < names.Length; index++) {
                        if (!root.TryGetProperty(names[index], out var coordinate) || coordinate.ValueKind != JsonValueKind.Number
                            || !coordinate.TryGetDouble(out bounds[index]) || !double.IsFinite(bounds[index])) {
                            throw new InvalidDataException("geometry must contain polygon rings or finite xmin, ymin, xmax and ymax envelope coordinates.");
                        }
                    }
                    if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
                        throw new InvalidDataException("An envelope must have xmin < xmax and ymin < ymax.");
                    }
                    // Project the rectangle as a polygon to preserve its footprint when
                    // coordinate systems differ, rather than projecting its bounding box.
                    geometry = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.FromJson(json));
                }
                ValidateQueryGeometry(geometry);
                return geometry;
            }
            catch (Exception exception) when (exception is System.Text.Json.JsonException or ArcGIS.Core.Geometry.Exceptions.GeometryException or ArgumentException) {
                throw new InvalidDataException("Invalid Esri JSON geometry. Supply a nonempty envelope or polygon with a known spatial reference.", exception);
            }
        }

        private static void ValidateQueryGeometry(Geometry geometry) {
            if (geometry.IsEmpty || geometry.SpatialReference is null || geometry.SpatialReference.IsUnknown) {
                throw new InvalidDataException("The query geometry must be nonempty and have a known spatial reference.");
            }
            var extent = geometry.Extent;
            if (!double.IsFinite(extent.XMin) || !double.IsFinite(extent.YMin) || !double.IsFinite(extent.XMax) || !double.IsFinite(extent.YMax)
                || extent.Width <= 0 || extent.Height <= 0
                || geometry is Polygon polygon && (!double.IsFinite(polygon.Area) || polygon.Area == 0 || polygon.Points.Any(point => !double.IsFinite(point.X) || !double.IsFinite(point.Y)))) {
                throw new InvalidDataException("The query geometry must have finite coordinates and a nonzero area in the target spatial reference.");
            }
        }

        public string DiagnosticName => nameof(PackageRepository);

        public Guid AddAttachment(Stream stream, string fileName, DateTimeOffset dateTimeOffsetUtc) {
            using (var connector = this.createGeodatabase()) {
                using (Table attachment = connector.OpenDataset<Table>(this._standaloneTableDefinitions["attachment"].GetName())) {
                    using var rowBuffer = attachment.CreateRowBuffer();
                    using var insertCursor = attachment.CreateInsertCursor();

                    var supportFile = new S100BlueStack.Settings.SupportFile {
                        FileName = fileName,
                        date = DateOnly.FromDateTime(dateTimeOffsetUtc.Date),

                        s100_SupportFileFormat = Path.GetExtension(fileName).ToLower() switch {
                            ".txt" => S100FC.S100.S100_SupportFileFormat.TXT,
                            ".mp4" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".mov" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".avi" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".flv" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".webm" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".mkv" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".mpeg" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".mpg" => S100FC.S100.S100_SupportFileFormat.VIDEO,
                            ".xml" => S100FC.S100.S100_SupportFileFormat.XML,
                            ".xslt" => S100FC.S100.S100_SupportFileFormat.XSLT,
                            ".zip" => S100FC.S100.S100_SupportFileFormat.other,
                            _ => throw new NotSupportedException($"Illegal file extension for support files: {Path.GetExtension(fileName).ToLower()}")
                        }
                    };

                    using var memoryStream = new MemoryStream();
                    stream.CopyTo(memoryStream);
                    memoryStream.Position = 0;

                    rowBuffer["ps"] = "S-100";
                    rowBuffer["code"] = "supportfile";
                    rowBuffer["json"] = JsonSerializer.Serialize(supportFile, jsonSerializerOptions);
                    rowBuffer["data_size"] = memoryStream.Length;
                    rowBuffer["data"] = memoryStream;

                    using var row = attachment.CreateRow(rowBuffer);

                    return Guid.Parse($"{row.GetGlobalID():B}");
                }
            }
        }

        public string AddPackageAOI(Geometry geometry, string packageId, string absoluteUri) {
            using (var connector = this.createGeodatabase()) {
                using var fc = geometry.GeometryType switch {
                    GeometryType.Point => connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["point"].GetName()),
                    GeometryType.Multipoint => connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["pointset"].GetName()),
                    GeometryType.Polyline => connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["curve"].GetName()),
                    GeometryType.Polygon => connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName()),
                    _ => throw new NotImplementedException(),
                };

                using var buffer = fc.CreateRowBuffer();
                buffer["ps"] = "S-840";
                buffer["code"] = nameof(PackageCoverage);
                buffer["attributebindings"] = new PackageCoverage { packageId = packageId, absoluteUri = absoluteUri }.Flatten();
                buffer["shape"] = geometry;

                using var row = fc.CreateRow(buffer);

                return $"{fc.GetName().Split('.')[^1]}::{row.GetGlobalID():B}";
            }
        }

        /// <summary>Stores a package AOI and its complete detail groups in one geodatabase transaction.</summary>
        /// <param name="aoi">The WGS84 envelope rectangle.</param>
        /// <param name="points">All detailed points, if present.</param>
        /// <param name="curves">All detailed line parts, if present.</param>
        /// <param name="surfaces">All detailed polygon rings, if present.</param>
        /// <param name="packageId">The package identity written to attribute bindings.</param>
        /// <param name="absoluteUri">The URI of the original source document.</param>
        /// <param name="cancellationToken">Cancels before or between row writes.</param>
        /// <returns>References used by PackageCreated and DetailedGeometryAdded.</returns>
        public (string Aoi, DetailedGeometry Details) AddPackageGeometries(Polygon aoi, Multipoint? points, Polyline? curves, Polygon? surfaces, string packageId, string absoluteUri, CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            using var connector = this.createGeodatabase();
            string aoiRef = string.Empty;
            var pointRefs = new List<string>();
            string? curveRef = null, surfaceRef = null;
            connector.ApplyEdits(() => {
                aoiRef = Insert(aoi, "surface", nameof(PackageCoverage), true);
                if (points is not null && !points.IsEmpty) {
                    var table = points.PointCount == 1 ? "point" : "pointset";
                    using var pointClass = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions[table].GetName());
                    using var pointDefinition = pointClass.GetDefinition();
                    switch (pointDefinition.GetShapeType()) {
                        case GeometryType.Point:
                            // PointSet is a domain name; this template stores its
                            // members as individual Point rows, not a Multipoint row.
                            foreach (var point in points.Points) {
                                pointRefs.Add(Insert(point, table, nameof(PackageDetailedGeometry), false));
                            }
                            break;
                        case GeometryType.Multipoint:
                            pointRefs.Add(Insert(points, table, nameof(PackageDetailedGeometry), false));
                            break;
                        default:
                            throw new InvalidOperationException($"Point detail class '{pointClass.GetName()}' has unsupported shape type '{pointDefinition.GetShapeType()}'.");
                    }
                    this._logger.LogInformation("Stored point details. PackageId: {PackageId}, SourcePointCount: {SourcePointCount}, StoredFeatureCount: {StoredFeatureCount}, Table: {Table}.", packageId, points.PointCount, pointRefs.Count, pointClass.GetName());
                }
                if (curves is not null) { curveRef = Insert(curves, "curve", nameof(PackageDetailedGeometry), false); }
                if (surfaces is not null) { surfaceRef = Insert(surfaces, "surface", nameof(PackageDetailedGeometry), false); }
                cancellationToken.ThrowIfCancellationRequested();
            });
            return (aoiRef, new DetailedGeometry(pointRefs.Count == 1 ? pointRefs[0] : null, curveRef, surfaceRef) { PointRefs = pointRefs.ToArray() });

            string Insert(Geometry geometry, string table, string code, bool rectangle) {
                cancellationToken.ThrowIfCancellationRequested();
                using var fc = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions[table].GetName());
                using var definition = fc.GetDefinition();
                var spatialReference = definition.GetSpatialReference();
                var projected = GeometryEngine.Instance.Project(geometry, spatialReference);
                if (rectangle) {
                    // Envelope the full details after projection so the AOI is
                    // still an axis-aligned rectangle in the destination system.
                    Geometry?[] details = [points, curves, surfaces];
                    var extents = details.OfType<Geometry>().Select(detail => GeometryEngine.Instance.Project(detail, spatialReference).Extent).ToArray();
                    var xmin = extents.Min(extent => extent.XMin);
                    var ymin = extents.Min(extent => extent.YMin);
                    var xmax = extents.Max(extent => extent.XMax);
                    var ymax = extents.Max(extent => extent.YMax);
                    var fallback = projected.Extent;
                    if (xmin == xmax) { xmin = Math.Min(xmin, fallback.XMin); xmax = Math.Max(xmax, fallback.XMax); }
                    if (ymin == ymax) { ymin = Math.Min(ymin, fallback.YMin); ymax = Math.Max(ymax, fallback.YMax); }
                    projected = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(xmin, ymin, xmax, ymax, spatialReference));
                }
                var expectedType = definition.GetShapeType();
                var hasZ = definition.HasZ();
                var hasM = definition.HasM();
                if (projected.IsEmpty || projected.GeometryType != expectedType) {
                    throw new InvalidOperationException($"Cannot store package '{packageId}' geometry in '{fc.GetName()}': source type {projected.GeometryType}, empty={projected.IsEmpty}, target type {expectedType}.");
                }
                var compatible = MatchDimensions(projected, hasZ, hasM);
                using var buffer = fc.CreateRowBuffer();
                buffer["ps"] = "S-840";
                buffer["code"] = code;
                buffer["attributebindings"] = code == nameof(PackageCoverage)
                    ? new PackageCoverage { packageId = packageId, absoluteUri = absoluteUri }.Flatten()
                    : new PackageDetailedGeometry { packageId = packageId, absoluteUri = absoluteUri }.Flatten();
                try {
                    buffer[definition.GetShapeField()] = compatible;
                    using var row = fc.CreateRow(buffer);
                    return $"{fc.GetName().Split('.')[^1]}::{row.GetGlobalID():B}";
                }
                catch (GeodatabaseGeometryException exception) {
                    this._logger.LogError(exception, "Package geometry write failed. PackageId: {PackageId}, Table: {Table}, ShapeField: {ShapeField}, GeometryType: {GeometryType}, HasZ: {HasZ}, HasM: {HasM}.", packageId, fc.GetName(), definition.GetShapeField(), compatible.GeometryType, compatible.HasZ, compatible.HasM);
                    throw new InvalidOperationException($"Could not write package '{packageId}' geometry to '{fc.GetName()}' ({expectedType}, HasZ={hasZ}, HasM={hasM}). See the geometry diagnostics for the native error.", exception);
                }
            }
        }

        internal static Geometry MatchDimensions(Geometry geometry, bool hasZ, bool hasM) {
            GeometryBuilderEx builder = geometry switch {
                MapPoint point => new MapPointBuilderEx(point),
                Multipoint points => new MultipointBuilderEx(points),
                Polyline curve => new PolylineBuilderEx(curve),
                Polygon surface => new PolygonBuilderEx(surface),
                _ => throw new InvalidOperationException($"Unsupported package geometry type '{geometry.GeometryType}'."),
            };
            builder.HasZ = hasZ;
            builder.HasM = hasM;
            builder.HasID = false;
            // Incoming geometries have XY only. Zero is the Z placeholder
            // when the destination requires Z; missing measures remain NaN.
            if (hasZ && builder is MapPointBuilderEx pointBuilder) {
                pointBuilder.Z = 0;
            }
            if (hasZ && builder is MultipointBuilderEx pointsBuilder) {
                pointsBuilder.Zs = Enumerable.Repeat(0d, pointsBuilder.PointCount).ToArray();
            }
            var compatible = builder.ToGeometry();
            if (hasZ && compatible is Multipart multipart) {
                compatible = GeometryEngine.Instance.SetConstantZ(multipart, 0);
            }
            return compatible;
        }

        public string AddSeverityAOI(Polygon geometry, ulong severity) {
            using (var connector = this.createGeodatabase()) {
                using var fc = geometry.GeometryType switch {
                    GeometryType.Polygon => connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName()),
                    _ => throw new NotImplementedException(),
                };

                using var buffer = fc.CreateRowBuffer();
                buffer["ps"] = "S-840";
                buffer["code"] = nameof(SeverityCoverage);
                buffer["attributebindings"] = new SeverityCoverage { severity = severity }.Flatten();
                buffer["shape"] = geometry;

                using var row = fc.CreateRow(buffer);
                return $"{fc.GetName().Split('.')[^1]}::{row.GetGlobalID():B}";
            }
        }

        /// <summary>Parses an Esri JSON polygon; this does not convert GeoJSON.</summary>
        /// <param name="esriJson">An Esri JSON polygon with rings and a spatialReference.</param>
        /// <returns>The parsed ArcGIS polygon.</returns>
        public Polygon FromEsriJson(string esriJson) {
            var polygon = PolygonBuilderEx.FromJson(esriJson);
            return polygon;
        }

        /// <summary>Projects package events into the singleton repository's in-memory listing.</summary>
        /// <param name="context">The subscription event and its originating stream.</param>
        /// <returns>Handled for package events, ignored for unrelated events, or failure when creation is missing.</returns>
        public ValueTask<EventHandlingStatus> HandleEvent(IMessageConsumeContext context) {
            var status = context.Message switch {
                PackagesEvents.V1.PackageCreated evt => this.Handle_PackageCreated(evt),
                PackagesEvents.V1.SeverityUpdated evt => this.Handle_PackageUpdated(context.Stream.GetId(), evt),
                PackagesEvents.V1.DetailedGeometryAdded evt => this.Handle_PackageUpdated(context.Stream.GetId(), evt),
                PackagesEvents.V1.GeometryReplaced evt => this.Handle_PackageUpdated(context.Stream.GetId(), evt),
                DispatcherEvents.V1.Binded evt => this.HandleAssignment(evt.PackageId, evt.PipelineId, true, context.GlobalPosition),
                DispatcherEvents.V1.Unbound evt => this.HandleAssignment(evt.PackageId, evt.PipelineId, false, context.GlobalPosition),
                _ => EventHandlingStatus.Ignored,
            };
            return ValueTask.FromResult(status);
        }

        private EventHandlingStatus Handle_PackageCreated(PackagesEvents.V1.PackageCreated evt) {
            this._packages.TryAdd(evt.PackageId, new PackageState().When(evt));
            return EventHandlingStatus.Handled;
        }

        private EventHandlingStatus HandleAssignment(string packageId, string pipelineId, bool active, ulong position) {
            this._assignments.Update(packageId, pipelineId, active, position);
            return EventHandlingStatus.Handled;
        }

        private EventHandlingStatus Handle_PackageUpdated(string packageId, object evt) {
            while (this._packages.TryGetValue(packageId, out var state)) {
                var updated = state.When(evt);
                if (this._packages.TryUpdate(packageId, updated, state)) {
                    return EventHandlingStatus.Handled;
                }
            }

            this._logger.LogError("Cannot project package event before package creation. PackageId: {PackageId}, EventType: {EventType}.", packageId, evt.GetType().Name);
            return EventHandlingStatus.Failure;
        }
        public async ValueTask DisposeAsync() {
            await this._arcDispatcher.ExecuteAsync(() => {
                foreach (var definition in this._featureClassDefinitions.Values) { definition.Dispose(); }
                foreach (var definition in this._standaloneTableDefinitions.Values) { definition.Dispose(); }
                return true;
            });
        }
    }
}
