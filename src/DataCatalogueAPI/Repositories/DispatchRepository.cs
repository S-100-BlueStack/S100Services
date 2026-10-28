using S100FC;
using S100FC.S840.FeatureTypes;
using ArcGIS.Core.Data;
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
    public partial class DispatchRepository : IEventHandler, IAsyncDisposable
    {
        internal static readonly JsonSerializerOptions jsonSerializerOptions = new JsonSerializerOptions {
            WriteIndented = false,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            PropertyNameCaseInsensitive = true,
        };

        private readonly ArcGisDispatcher _arcDispatcher;

        private readonly IOptions<DispatcherOptions> _luggageOptions;

        private readonly ILogger<DispatchRepository> _logger;

        private readonly Func<Geodatabase> createGeodatabase = () => { throw new NotImplementedException(); };

        private readonly IReadOnlyDictionary<string, FeatureClassDefinition> _featureClassDefinitions;
        private readonly IReadOnlyDictionary<string, TableDefinition> _standaloneTableDefinitions;

        public DispatchRepository(ArcGisDispatcher arcDispatcher, IOptions<DispatcherOptions> options, ILogger<DispatchRepository> logger) {
            this._arcDispatcher = arcDispatcher;
            this._luggageOptions = options ?? throw new ArgumentNullException(nameof(options));
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

        private ConcurrentDictionary<string, CategoryState> _categories = [];

        public string[] Categories => [.. this._categories.Keys];

        public CategoryState GetCategory(string id) => this._categories[id];

        public async ValueTask<EventHandlingStatus> HandleEvent(IMessageConsumeContext context) {            
            return context.Message switch {
                DispatcherEvents.V1.CategoryCreated evt => this.Handle_CategoryCreated(evt),
                DispatcherEvents.V1.CategorySpecificationUpdated evt => this.Handle_CategorySpecificationUpdated(context.Stream.GetId(), evt),
                PackagesEvents.V1.PackageCreated evt => this.Handle_PackageCreated(evt),
                _ => EventHandlingStatus.Ignored,
            };
        }

        private EventHandlingStatus Handle_CategoryCreated(DispatcherEvents.V1.CategoryCreated evt) {
            var state = new CategoryState();
            state = state.When(evt);
            var added = this._categories.TryAdd(evt.CategoryId, state);

            return EventHandlingStatus.Handled;
        }

        private EventHandlingStatus Handle_CategorySpecificationUpdated(string categoryId, DispatcherEvents.V1.CategorySpecificationUpdated evt) {
            // Specification events carry no category ID; their stream identifies the
            // category. Apply them to its existing state to preserve creation fields.
            while (this._categories.TryGetValue(categoryId, out var state)) {
                var updated = state.When(evt);
                if (this._categories.TryUpdate(categoryId, updated, state)) {
                    return EventHandlingStatus.Handled;
                }
            }

            this._logger.LogError("Cannot project category specification before category creation. CategoryId: {CategoryId}, SpecificationVersion: {SpecificationVersion}.", categoryId, evt.Version);
            return EventHandlingStatus.Failure;
        }

        private EventHandlingStatus Handle_PackageCreated(PackagesEvents.V1.PackageCreated evt) {
            var state = new PackageState();
            state = state.When(evt);          

            return EventHandlingStatus.Handled;
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
