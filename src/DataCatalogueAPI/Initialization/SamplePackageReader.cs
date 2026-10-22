using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.PackageTypes;
using DataCatalague.Api.Repositories;
using System.IO.Compression;
using System.Text.Json.Nodes;

namespace DataCatalague.Api.Initialization;

/// <summary>Builds requests from development fixtures; never participates in normal API request handling.</summary>
/// <param name="dispatcher">Runs the ArcGIS shapefile reader on the registered dispatcher.</param>
/// <param name="logger">Reports cleanup errors for temporary extracted archives.</param>
public sealed class SamplePackageReader(ArcGisDispatcher dispatcher, ILogger<SamplePackageReader> logger)
{
    private const long MaximumExpandedBytes = 256L * 1024 * 1024;

    /// <summary>Converts a notice sample to the request accepted by the existing package controller.</summary>
    /// <param name="sourceFile">Path to a notice fixture file.</param>
    /// <param name="cancellationToken">Cancels file loading.</param>
    /// <returns>The shared package creation request.</returns>
    public async Task<CreatePackageRequest> ReadNoticeAsync(string sourceFile, CancellationToken cancellationToken) {
        var fullPath = RequireSourceFile(sourceFile);
        var notice = NoticeToMariners.Parse(await File.ReadAllTextAsync(fullPath, cancellationToken).ConfigureAwait(false));
        if (string.IsNullOrWhiteSpace(notice.MetaData.ShortId)) {
            throw new InvalidDataException($"Notice '{Path.GetFileName(fullPath)}' has no shortId.");
        }
        return new CreatePackageRequest {
            Category = "NoticeToMariners",
            AbsoluteUri = new Uri(fullPath).AbsoluteUri,
            EsriJSON = notice.Geometry.Aoi,
            DetailedGeometry = notice.Geometry,
            MetaData = notice.MetaData,
            Descriptions = notice.Descriptions,
            Charts = notice.Charts,
        };
    }

    /// <summary>Converts a GeneralSubmission sample ZIP to the request accepted by the package controller.</summary>
    /// <param name="sourceFile">Path to a submission ZIP fixture.</param>
    /// <param name="cancellationToken">Cancels extraction and geometry reading.</param>
    /// <returns>The shared package creation request.</returns>
    public async Task<CreatePackageRequest> ReadGeneralSubmissionAsync(string sourceFile, CancellationToken cancellationToken) {
        sourceFile = RequireSourceFile(sourceFile);
        var directory = Path.Combine(Path.GetTempPath(), $"DataCatalogue-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        try {
            await ExtractAsync(sourceFile, directory, cancellationToken).ConfigureAwait(false);
            var manifests = Directory.GetFiles(directory, "*", SearchOption.AllDirectories).Where(file => string.Equals(Path.GetFileName(file), "submission.json", StringComparison.OrdinalIgnoreCase)).ToArray();
            if (manifests.Length != 1) {
                throw new InvalidDataException("A GeneralSubmission ZIP must contain exactly one submission.json.");
            }
            var contract = Path.Combine(Path.GetDirectoryName(manifests[0])!, "contract.txt");
            if (!Directory.GetFiles(Path.GetDirectoryName(manifests[0])!).Any(file => string.Equals(file, contract, StringComparison.OrdinalIgnoreCase))) {
                throw new InvalidDataException("The submission must contain contract.txt beside submission.json.");
            }
            var manifest = JsonNode.Parse(await File.ReadAllTextAsync(manifests[0], cancellationToken).ConfigureAwait(false)) as JsonObject
                ?? throw new InvalidDataException("submission.json must contain a JSON object.");
            // Older sample archives may still include an AOI. Never use or retain
            // those coordinates: the shapefile is the sole geometry source.
            foreach (var key in manifest.Select(property => property.Key).Where(key => key.Equals("aoi", StringComparison.OrdinalIgnoreCase) || key.Equals("coordinates", StringComparison.OrdinalIgnoreCase)).ToArray()) {
                manifest.Remove(key);
            }
            var title = Text(manifest, "title");
            var source = Text(manifest, "source");
            var description = Text(manifest, "description");
            var geometry = await dispatcher.ExecuteAsync(() => {
                try { return ReadGeometry(directory, cancellationToken); }
                catch (Exception exception) when (exception is ArcGIS.Core.Data.Exceptions.GeodatabaseException or ArcGIS.Core.Geometry.Exceptions.GeometryObjectException or ArgumentException) {
                    throw new InvalidDataException("Could not read polygon geometry from the submission shapefile.", exception);
                }
            }).ConfigureAwait(false);
            return new CreatePackageRequest {
                Category = "GeneralSubmission",
                AbsoluteUri = new Uri(Path.GetFullPath(sourceFile)).AbsoluteUri,
                EsriJSON = geometry.Aoi,
                DetailedGeometry = geometry,
                MetaData = new PackageMetaData(null, "GeneralSubmission", title, source, null, DateTimeOffset.UtcNow),
                Descriptions = description is null ? null : [new PackageDescription(null, description)],
                Charts = null,
            };
        }
        catch (System.Text.Json.JsonException exception) {
            throw new InvalidDataException("Invalid submission.json metadata.", exception);
        }
        finally {
            try { Directory.Delete(directory, recursive: true); }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException) {
                logger.LogWarning(exception, "Could not remove temporary submission directory {Directory}.", directory);
            }
        }
    }

    private static string RequireSourceFile(string sourceFile) {
        var fullPath = Path.GetFullPath(sourceFile);
        if (!File.Exists(fullPath)) { throw new InvalidDataException($"Sample file '{fullPath}' does not exist."); }
        return fullPath;
    }

    private static string? Text(JsonObject manifest, string property) {
        if (manifest[property] is null) { return null; }
        if (manifest[property] is JsonValue value && value.TryGetValue<string>(out var text)) { return text; }
        throw new InvalidDataException($"submission.json property '{property}' must be a string.");
    }

    private static async Task ExtractAsync(string sourceFile, string directory, CancellationToken cancellationToken) {
        using var archive = ZipFile.OpenRead(sourceFile);
        if (archive.Entries.Count > 1000) { throw new InvalidDataException("The submission ZIP contains too many entries."); }
        var root = Path.GetFullPath(directory) + Path.DirectorySeparatorChar;
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long expandedBytes = 0;
        foreach (var entry in archive.Entries) {
            cancellationToken.ThrowIfCancellationRequested();
            var name = entry.FullName.Replace('\\', '/');
            if (name.Contains(':') || Path.IsPathRooted(name)) { throw new InvalidDataException("The ZIP contains an invalid path."); }
            var path = Path.GetFullPath(Path.Combine(directory, name));
            if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !paths.Add(path)) {
                throw new InvalidDataException("The ZIP contains an unsafe or duplicate path.");
            }
            if (name.EndsWith('/')) { Directory.CreateDirectory(path); continue; }
            if (entry.Length > MaximumExpandedBytes - expandedBytes) { throw new InvalidDataException("The expanded submission ZIP exceeds 256 MiB."); }
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await using var input = entry.Open();
            await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true);
            var buffer = new byte[81920];
            int count;
            while ((count = await input.ReadAsync(buffer.AsMemory(), cancellationToken).ConfigureAwait(false)) != 0) {
                expandedBytes += count;
                if (expandedBytes > MaximumExpandedBytes) { throw new InvalidDataException("The expanded submission ZIP exceeds 256 MiB."); }
                await output.WriteAsync(buffer.AsMemory(0, count), cancellationToken).ConfigureAwait(false);
            }
        }
    }

    // All native dataset access stays on the registered CoreHost dispatcher.
    private static PackageGeometry ReadGeometry(string directory, CancellationToken cancellationToken) {
        var files = Directory.GetFiles(directory, "*", SearchOption.AllDirectories);
        var shapes = files.Where(file => Path.GetExtension(file).Equals(".shp", StringComparison.OrdinalIgnoreCase)).ToArray();
        if (shapes.Length != 1) { throw new InvalidDataException("A GeneralSubmission ZIP must contain exactly one polygon shapefile."); }
        var shape = shapes[0];
        foreach (var extension in new[] { ".shx", ".dbf", ".prj" }) {
            if (!files.Any(file => string.Equals(file, Path.ChangeExtension(shape, extension), StringComparison.OrdinalIgnoreCase))) {
                throw new InvalidDataException($"The shapefile is missing its {extension} file.");
            }
        }
        using var datastore = new FileSystemDatastore(new FileSystemConnectionPath(new Uri(Path.GetDirectoryName(shape)!), FileSystemDatastoreType.Shapefile));
        using var featureClass = datastore.OpenDataset<FeatureClass>(Path.GetFileName(shape));
        using var definition = featureClass.GetDefinition();
        if (definition.GetShapeType() != GeometryType.Polygon || definition.GetSpatialReference() is not { IsUnknown: false }) {
            throw new InvalidDataException("The submission shapefile must contain polygons with a known spatial reference.");
        }
        var polygons = new List<Geometry>();
        using (var cursor = featureClass.Search(new QueryFilter(), false)) {
            while (cursor.MoveNext()) {
                cancellationToken.ThrowIfCancellationRequested();
                using var feature = (Feature)cursor.Current;
                if (feature.GetShape() is not Polygon { IsEmpty: false } polygon) {
                    throw new InvalidDataException("The shapefile contains an empty or invalid polygon.");
                }
                polygons.Add(polygon);
            }
        }
        if (polygons.Count == 0) { throw new InvalidDataException("The submission shapefile contains no polygons."); }
        var surface = (Polygon)GeometryEngine.Instance.Union(polygons);
        var extent = surface.Extent;
        if (surface.IsEmpty || !double.IsFinite(extent.XMin) || !double.IsFinite(extent.YMin) || !double.IsFinite(extent.XMax) || !double.IsFinite(extent.YMax) || extent.Width <= 0 || extent.Height <= 0) {
            throw new InvalidDataException("The submission polygon must have a finite, nonzero extent.");
        }
        var aoi = PolygonBuilderEx.CreatePolygon(extent);
        return new PackageGeometry(aoi.ToJson(), null, null, surface.ToJson());
    }
}
