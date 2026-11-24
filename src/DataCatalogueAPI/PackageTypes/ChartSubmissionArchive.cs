using DataCatalague.Api.Domain;
using System.IO.Compression;
using System.Net;
using System.Text.Json;

namespace DataCatalague.Api.PackageTypes;

/// <summary>Reads ENC exchanges and GeoJSON submissions while preserving their original ZIP as the package attachment.</summary>
public static class ChartSubmissionArchive
{
    internal const int MaximumArchiveBytes = 16 * 1024 * 1024;
    private const int MaximumExpandedBytes = 64 * 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    internal static bool Supports(string category) => category is "ENC" or "Landdata" or "CoastAndRock";

    /// <summary>Validates an archive and maps its metadata and geometry without extracting its contents.</summary>
    /// <param name="category">ENC, Landdata or CoastAndRock.</param>
    /// <param name="input">The ZIP stream. The caller retains ownership.</param>
    /// <param name="cancellationToken">Cancels archive reads.</param>
    /// <returns>The catalogue data derived from the archive.</returns>
    /// <exception cref="InvalidDataException">The ZIP or its contents do not meet the specified category contract.</exception>
    public static async Task<Submission> ReadAsync(string category, Stream input, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(input);
        if (!Supports(category)) { throw new ArgumentException("Unsupported submission category.", nameof(category)); }

        try {
            var buffer = new byte[81920];
            using var bytes = new MemoryStream();
            await CopyBoundedAsync(input, bytes, MaximumArchiveBytes, buffer, cancellationToken);
            bytes.Position = 0;
            using var archive = new ZipArchive(bytes, ZipArchiveMode.Read);
            if (archive.Entries.Count is 0 or > 256) { throw new InvalidDataException("A submission ZIP must contain between 1 and 256 entries."); }

            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var files = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
            long declaredSize = 0;
            foreach (var entry in archive.Entries) {
                cancellationToken.ThrowIfCancellationRequested();
                var isDirectory = entry.FullName.EndsWith('/');
                var path = isDirectory ? entry.FullName[..^1] : entry.FullName;
                if (path.Length > 256 || path.IndexOfAny(['\\', ':']) >= 0
                    || path.Split('/').Any(segment => string.IsNullOrWhiteSpace(segment) || segment is "." or ".." || segment.Any(char.IsControl))
                    || ((entry.ExternalAttributes >> 16) & 0xf000) == 0xa000 || !paths.Add(path)) {
                    throw new InvalidDataException("The ZIP contains an unsafe or duplicate entry path.");
                }
                if (entry.Length > MaximumExpandedBytes - declaredSize) { throw new InvalidDataException("The expanded ZIP exceeds 64 MiB."); }
                declaredSize += entry.Length;
                if (isDirectory) {
                    if (entry.Length != 0) { throw new InvalidDataException("A ZIP directory entry cannot contain data."); }
                }
                else {
                    files.Add(path, entry);
                }
            }
            if (!files.TryGetValue("metadata.json", out var metadataEntry)) {
                throw new InvalidDataException("The ZIP requires metadata.json at its root.");
            }

            var geoJsonEntries = files.Values.Where(entry => HasContent(entry, ".geojson")).ToArray();
            if (category == "ENC") {
                if (!files.Values.Any(entry => HasContent(entry, ".000")) || !files.Values.Any(entry => HasContent(entry, ".vld"))) {
                    throw new InvalidDataException("An ENC ZIP requires a nonempty .000 dataset and .vld report.");
                }
            }
            else if (geoJsonEntries.Length != 1 || files.Values.Count(entry => HasExtension(entry, ".geojson")) != 1) {
                throw new InvalidDataException("A Landdata or Coast and Rock ZIP requires exactly one nonempty .geojson file.");
            }

            Metadata? metadata = null;
            using var geoJson = new MemoryStream();
            long expandedSize = 0;
            foreach (var entry in files.Values) {
                cancellationToken.ThrowIfCancellationRequested();
                await using var content = entry.Open();
                if (entry == metadataEntry) {
                    using var json = new MemoryStream();
                    expandedSize += await CopyBoundedAsync(content, json, Math.Min(64 * 1024, MaximumExpandedBytes - expandedSize), buffer, cancellationToken);
                    metadata = JsonSerializer.Deserialize<Metadata>(ReadJsonBytes(json).Span, JsonOptions);
                }
                else if (category != "ENC" && entry == geoJsonEntries[0]) {
                    expandedSize += await CopyBoundedAsync(content, geoJson, Math.Min(8 * 1024 * 1024, MaximumExpandedBytes - expandedSize), buffer, cancellationToken);
                }
                else {
                    var actualLength = await CopyBoundedAsync(content, Stream.Null, MaximumExpandedBytes - expandedSize, buffer, cancellationToken);
                    if (actualLength != entry.Length) { throw new InvalidDataException("A ZIP entry's declared size does not match its content."); }
                    expandedSize += actualLength;
                }
            }
            if (metadata is null || string.IsNullOrWhiteSpace(metadata.Title) || string.IsNullOrWhiteSpace(metadata.Source)) {
                throw new InvalidDataException("metadata.json requires a title and source.");
            }

            PackageGeometry geometry;
            if (category == "ENC") {
                if (metadata.Aoi.ValueKind != JsonValueKind.Object
                    || metadata.Aoi.GetProperty("type").GetString() is not ("Polygon" or "MultiPolygon")) {
                    throw new InvalidDataException("ENC metadata requires a WGS84 GeoJSON Polygon or MultiPolygon in aoi.");
                }
                geometry = GeoJsonPackageGeometry.Parse(metadata.Aoi);
            }
            else {
                using var document = JsonDocument.Parse(ReadJsonBytes(geoJson));
                geometry = GeoJsonPackageGeometry.Parse(document.RootElement);
            }

            var packageMetadata = new PackageMetaData(metadata.ShortId?.Trim(), category, metadata.Title.Trim(), metadata.Source.Trim(), metadata.RefId?.Trim(), metadata.CreatedUtc?.ToUniversalTime());
            PackageDescription[]? descriptions = string.IsNullOrWhiteSpace(metadata.Summary)
                ? null
                : [new PackageDescription(string.IsNullOrWhiteSpace(metadata.Language) ? "en" : metadata.Language.Trim(), $"<p>{WebUtility.HtmlEncode(metadata.Summary.Trim())}</p>")];
            return new(packageMetadata, geometry, descriptions);
        }
        catch (Exception exception) when (exception is JsonException or KeyNotFoundException or InvalidOperationException or FormatException) {
            throw new InvalidDataException("Invalid submission metadata or GeoJSON.", exception);
        }
    }

    private static ReadOnlyMemory<byte> ReadJsonBytes(MemoryStream json) {
        var bytes = json.GetBuffer().AsMemory(0, (int)json.Length);
        return bytes.Span.StartsWith(new byte[] { 0xef, 0xbb, 0xbf }) ? bytes[3..] : bytes;
    }

    private static bool HasContent(ZipArchiveEntry entry, string extension) => entry.Length > 0 && HasExtension(entry, extension);

    private static bool HasExtension(ZipArchiveEntry entry, string extension) => Path.GetExtension(entry.Name).Equals(extension, StringComparison.OrdinalIgnoreCase);

    private static async Task<long> CopyBoundedAsync(Stream input, Stream output, long limit, byte[] buffer, CancellationToken cancellationToken) {
        long total = 0;
        int count;
        while ((count = await input.ReadAsync(buffer.AsMemory(), cancellationToken)) > 0) {
            total += count;
            if (total > limit) { throw new InvalidDataException("The ZIP or an expanded entry exceeds its size limit."); }
            await output.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
        }
        return total;
    }

    /// <summary>Metadata and Esri geometry for a validated archive.</summary>
    /// <param name="MetaData">Source metadata mapped to the catalogue model.</param>
    /// <param name="Geometry">The AOI and detailed geometry parsed from the archive.</param>
    /// <param name="Descriptions">The optional HTML-encoded summary.</param>
    public sealed record Submission(PackageMetaData MetaData, PackageGeometry Geometry, PackageDescription[]? Descriptions);

    private sealed record Metadata(string? Title, string? Source, string? ShortId, string? RefId, DateTimeOffset? CreatedUtc, string? Summary, string? Language, JsonElement Aoi);
}
