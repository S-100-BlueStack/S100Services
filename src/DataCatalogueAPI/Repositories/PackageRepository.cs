using ArcGIS.Core.Data;
using ArcGIS.Core.Data.Exceptions;
using ArcGIS.Core.Geometry;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Events;
using Eventuous.Subscriptions;
using Eventuous.Subscriptions.Context;
using Microsoft.Extensions.Options;
using System.Text.Json;
using IO = System.IO;

namespace DataCatalague.Api.Repositories
{
    public class PackageRepository : IEventHandler
    {
        internal static readonly JsonSerializerOptions jsonSerializerOptions = new JsonSerializerOptions {
            WriteIndented = false,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            PropertyNameCaseInsensitive = true,
        };

        private readonly IOptions<PackagesOptions> _options;

        private readonly ILogger<PackageRepository> _logger;

        private readonly Func<Geodatabase> createGeodatabase = () => { throw new NotImplementedException(); };

        private readonly IReadOnlyDictionary<string, FeatureClassDefinition> _featureClassDefinitions;
        private readonly IReadOnlyDictionary<string, TableDefinition> _standaloneTableDefinitions;

        public PackageRepository(ArcGisDispatcher arcDispatcher, IOptions<PackagesOptions> options, ILogger<PackageRepository> logger) {
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

        public string DiagnosticName => nameof(DispatchRepository);

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

                    var memoryStream = new MemoryStream();
                    stream.CopyTo(memoryStream);
                    memoryStream.Position = 0;

                    rowBuffer["ps"] = "S-100";
                    rowBuffer["code"] = "supportfile";
                    rowBuffer["json"] = JsonSerializer.Serialize(supportFile, jsonSerializerOptions);
                    rowBuffer["data_size"] = memoryStream.Length;
                    rowBuffer["data"] = memoryStream;

                    var row = attachment.CreateRow(rowBuffer);

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
                buffer["ps"] = "";
                buffer["code"] = "PackageCoverage";
                buffer["attributebindings"] = JsonSerializer.Serialize(new {
                    packageId,
                    absoluteUri,
                }, jsonSerializerOptions);
                buffer["shape"] = geometry;

                var row = fc.CreateRow(buffer);

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
                aoiRef = Insert(aoi, "surface", "PackageCoverage", true);
                if (points is not null && !points.IsEmpty) {
                    var table = points.PointCount == 1 ? "point" : "pointset";
                    using var pointClass = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions[table].GetName());
                    using var pointDefinition = pointClass.GetDefinition();
                    switch (pointDefinition.GetShapeType()) {
                        case GeometryType.Point:
                            // PointSet is a domain name; this template stores its
                            // members as individual Point rows, not a Multipoint row.
                            foreach (var point in points.Points) {
                                pointRefs.Add(Insert(point, table, "PackageDetailedGeometry", false));
                            }
                            break;
                        case GeometryType.Multipoint:
                            pointRefs.Add(Insert(points, table, "PackageDetailedGeometry", false));
                            break;
                        default:
                            throw new InvalidOperationException($"Point detail class '{pointClass.GetName()}' has unsupported shape type '{pointDefinition.GetShapeType()}'.");
                    }
                    this._logger.LogInformation("Stored point details. PackageId: {PackageId}, SourcePointCount: {SourcePointCount}, StoredFeatureCount: {StoredFeatureCount}, Table: {Table}.", packageId, points.PointCount, pointRefs.Count, pointClass.GetName());
                }
                if (curves is not null) { curveRef = Insert(curves, "curve", "PackageDetailedGeometry", false); }
                if (surfaces is not null) { surfaceRef = Insert(surfaces, "surface", "PackageDetailedGeometry", false); }
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
                buffer["ps"] = "";
                buffer["code"] = code;
                buffer["attributebindings"] = JsonSerializer.Serialize(new { packageId, absoluteUri }, jsonSerializerOptions);
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

        private static Geometry MatchDimensions(Geometry geometry, bool hasZ, bool hasM) {
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
                buffer["ps"] = "";
                buffer["code"] = "SeverityCoverage";
                buffer["attributebindings"] = JsonSerializer.Serialize(new {
                    severity,
                }, jsonSerializerOptions);
                buffer["shape"] = geometry;

                var row = fc.CreateRow(buffer);
                return $"{fc.GetName().Split('.')[^1]}::{row.GetGlobalID():B}";
            }
        }

        public Polygon FromGeoJson(string geoJson) {
            var polygon = PolygonBuilderEx.FromJson(geoJson);
            return polygon;
        }

        public async ValueTask<EventHandlingStatus> HandleEvent(IMessageConsumeContext context) {
            return context.Message switch {
                PackagesEvents.V1.PackageCreated evt => this.Handle_PackageCreated(evt),
                _ => EventHandlingStatus.Ignored,
            };
        }


        private EventHandlingStatus Handle_PackageCreated(PackagesEvents.V1.PackageCreated evt) {
            var state = new PackageState();
            state = state.When(evt);

            return EventHandlingStatus.Handled;
        }
    }
}
