using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Controllers;
using Microsoft.Extensions.Options;
using S100BlueStack.Settings;
using System.Collections.Concurrent;
using System.Net.Mail;
using System.Text.Json;
using static S100BlueStack.Settings.ProductCatalogue;
using IO = System.IO;

namespace DataCatalague.Api.Repositories
{
    public class DispatchRepository
    {
        internal static readonly JsonSerializerOptions jsonSerializerOptions = new JsonSerializerOptions {
            WriteIndented = false,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            PropertyNameCaseInsensitive = true,
        };

        private readonly IOptions<DispatcherOptions> _luggageOptions;

        private readonly ILogger<DispatchRepository> _logger;

        private readonly Func<Geodatabase> createGeodatabase = () => { throw new NotImplementedException(); };

        private readonly IReadOnlyDictionary<string, FeatureClassDefinition> _featureClassDefinitions;
        private readonly IReadOnlyDictionary<string, TableDefinition> _standaloneTableDefinitions;

        public DispatchRepository(ArcGisDispatcher arcDispatcher, IOptions<DispatcherOptions> options, ILogger<DispatchRepository> logger) {
            _luggageOptions = options ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));

            var geodatabase = options.Value.Geodatabase;

            if (IO.File.Exists(geodatabase) && ".sde".Equals(IO.Path.GetExtension(geodatabase), StringComparison.OrdinalIgnoreCase)) {
                createGeodatabase = () => { return new Geodatabase(new DatabaseConnectionFile(new Uri(IO.Path.GetFullPath(geodatabase)))); };
            }
            else if (IO.Directory.Exists(geodatabase) && ".gdb".Equals(IO.Path.GetExtension(geodatabase), StringComparison.OrdinalIgnoreCase)) {
                createGeodatabase = () => { return new Geodatabase(new FileGeodatabaseConnectionPath(new Uri(IO.Path.GetFullPath(geodatabase)))); };
            }
            else if (".geodatabase".Equals(IO.Path.GetExtension(geodatabase), StringComparison.OrdinalIgnoreCase)) {
                createGeodatabase = () => {
                    return new Geodatabase(new MobileGeodatabaseConnectionPath(new Uri(IO.Path.GetFullPath(geodatabase))));
                };
            }
            else if (geodatabase.StartsWith("https://")) {
                createGeodatabase = () => { return new Geodatabase(new ServiceConnectionProperties(new Uri(geodatabase))); };
            }
            else
                throw new System.ArgumentOutOfRangeException(nameof(options.Value.Geodatabase));

            var definitions = arcDispatcher.ExecuteAsync(() => {
                using var connector = createGeodatabase();

                var syntax = connector.GetSQLSyntax();

                return (
                    connector.GetDefinitions<FeatureClassDefinition>().ToDictionary(e => syntax.ParseTableName(e.GetName()).Item3.ToLowerInvariant(), e => e),
                    connector.GetDefinitions<TableDefinition>().ToDictionary(e => syntax.ParseTableName(e.GetName()).Item3.ToLowerInvariant(), e => e));
            }).ConfigureAwait(false).GetAwaiter().GetResult();

            _featureClassDefinitions = definitions.Item1;
            _standaloneTableDefinitions = definitions.Item2;
        }

        public Guid AddAttachment(Stream stream, string fileName, DateTimeOffset dateTimeOffsetUtc) {
            using (var connector = createGeodatabase()) {
                using (Table attachment = connector.OpenDataset<Table>(this._standaloneTableDefinitions["attachment"].GetName())) {
                    using var rowBuffer = attachment.CreateRowBuffer();
                    using var insertCursor = attachment.CreateInsertCursor();

                    var supportFile = new S100BlueStack.Settings.SupportFile {
                        FileName = fileName,
                    };

                    supportFile.date = DateOnly.FromDateTime(dateTimeOffsetUtc.Date);

                    supportFile.s100_SupportFileFormat = Path.GetExtension(fileName).ToLower() switch {
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
            using (var connector = createGeodatabase()) {
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

        public Polygon FromGeoJson(string geoJson) {
            var polygon = PolygonBuilderEx.FromJson(geoJson);
            return polygon;
        }
    }
}
