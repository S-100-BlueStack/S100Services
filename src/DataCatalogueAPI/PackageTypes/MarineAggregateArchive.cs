using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DataCatalague.Api.PackageTypes;

/// <summary>Submission-level provenance and file references for version 1.0 of an MA archive.</summary>
/// <param name="SchemaVersion">The supported archive contract version, currently 1.0.</param>
/// <param name="Category">The exact MarineAggregateExtraction category identifier.</param>
/// <param name="SourceUrl">The HTTP(S) source from which the site data was obtained; never fetched during import.</param>
/// <param name="RetrievedAtUtc">Actual source retrieval time in UTC, or null when the supplied snapshot's capture time is unknown.</param>
/// <param name="GeoJsonFile">The root areas.geojson file containing exactly one site.</param>
/// <param name="Documents">Optional PDF paths under documents/, preserved inside the original ZIP.</param>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record MarineAggregateManifest(string SchemaVersion, string Category, string SourceUrl, [property: JsonConverter(typeof(MarineAggregateUtcConverter))] DateTimeOffset? RetrievedAtUtc, string GeoJsonFile, string[]? Documents);

/// <summary>A validated MA submission with its typed manifest and complete source site.</summary>
/// <param name="Manifest">Submission provenance; site attributes remain in GeoJSON.</param>
/// <param name="Site">The single site mapped into existing package metadata and geometry.</param>
public sealed record MarineAggregateArchive(MarineAggregateManifest Manifest, MarineAggregateExtraction Site)
{
    /// <summary>Maximum compressed ZIP size, 16 MiB.</summary>
    public const int MaximumArchiveBytes = 16 * 1024 * 1024;
    /// <summary>Maximum cumulative expanded size, 64 MiB.</summary>
    public const int MaximumExpandedBytes = 64 * 1024 * 1024;
    private const int MaximumEntries = 100;
    private const int MaximumManifestBytes = 64 * 1024;
    private const int MaximumGeoJsonBytes = 8 * 1024 * 1024;

    /// <summary>Validates a ZIP without extracting files, fetching links or closing the caller's stream.</summary>
    /// <param name="stream">The ZIP bytes, read from the current stream position.</param>
    /// <param name="cancellationToken">Cancels bounded archive and entry reads.</param>
    /// <returns>The manifest and one site; PDFs remain in the original archive.</returns>
    /// <exception cref="InvalidDataException">The archive is unsafe, oversized or does not satisfy the MA contract.</exception>
    public static async Task<MarineAggregateArchive> ReadAsync(Stream stream, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(stream);
        try {
            using var bytes = new MemoryStream();
            await CopyBoundedAsync(stream, bytes, MaximumArchiveBytes, cancellationToken).ConfigureAwait(false);
            bytes.Position = 0;
            using var archive = new ZipArchive(bytes, ZipArchiveMode.Read, leaveOpen: true);
            if (archive.Entries.Count is 0 or > MaximumEntries) { throw new InvalidDataException("An MA ZIP must contain between 1 and 100 entries."); }

            var files = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long declaredSize = 0;
            foreach (var entry in archive.Entries) {
                cancellationToken.ThrowIfCancellationRequested();
                var directory = entry.FullName.EndsWith('/');
                var path = directory ? entry.FullName[..^1] : entry.FullName;
                ValidatePath(path);
                if (!paths.Add(path) || ((entry.ExternalAttributes >> 16) & 0xf000) == 0xa000) {
                    throw new InvalidDataException("The MA ZIP contains duplicate paths or symbolic links.");
                }
                declaredSize = checked(declaredSize + entry.Length);
                if (declaredSize > MaximumExpandedBytes) { throw new InvalidDataException("The expanded MA ZIP exceeds 64 MiB."); }
                if (directory) {
                    if (path != "documents" || entry.Length != 0) { throw new InvalidDataException("Only an empty documents/ directory entry is permitted."); }
                    continue;
                }
                files.Add(path, entry);
            }
            if (!files.TryGetValue("manifest.json", out var manifestEntry) || manifestEntry.FullName != "manifest.json") {
                throw new InvalidDataException("The MA ZIP requires a root manifest.json.");
            }
            var manifestJson = await ReadTextAsync(manifestEntry, MaximumManifestBytes, cancellationToken).ConfigureAwait(false);
            var manifest = JsonSerializer.Deserialize<MarineAggregateManifest>(manifestJson.Text, new JsonSerializerOptions(JsonSerializerDefaults.Web))
                ?? throw new InvalidDataException("manifest.json must contain an object.");
            if (manifest.SchemaVersion != "1.0" || manifest.Category != "MarineAggregateExtraction" || manifest.GeoJsonFile != "areas.geojson"
                || !Uri.TryCreate(manifest.SourceUrl, UriKind.Absolute, out var source) || source.Scheme is not ("https" or "http") || source.UserInfo.Length != 0) {
                throw new InvalidDataException("The MA manifest requires schemaVersion 1.0, category MarineAggregateExtraction, geoJsonFile areas.geojson and an HTTP(S) sourceUrl.");
            }
            if (!files.TryGetValue(manifest.GeoJsonFile, out var geoJsonEntry) || geoJsonEntry.FullName != manifest.GeoJsonFile) {
                throw new InvalidDataException("The MA manifest's areas.geojson is missing.");
            }
            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "manifest.json", manifest.GeoJsonFile };
            foreach (var document in manifest.Documents ?? []) {
                ValidatePath(document);
                if (!document.StartsWith("documents/", StringComparison.Ordinal) || !document.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
                    || !allowed.Add(document) || !files.TryGetValue(document, out var entry) || entry.FullName != document) {
                    throw new InvalidDataException("Each manifest document must reference a distinct existing PDF under documents/.");
                }
            }
            if (files.Keys.Any(path => !allowed.Contains(path))) { throw new InvalidDataException("The MA ZIP contains files not declared by its manifest."); }

            var geoJson = await ReadTextAsync(geoJsonEntry, MaximumGeoJsonBytes, cancellationToken).ConfigureAwait(false);
            long expandedSize = manifestJson.Length + geoJson.Length;
            foreach (var document in manifest.Documents ?? []) {
                await using var input = files[document].Open();
                expandedSize += await CopyBoundedAsync(input, Stream.Null, MaximumExpandedBytes - expandedSize, cancellationToken).ConfigureAwait(false);
            }
            var sites = MarineAggregateExtraction.Parse(geoJson.Text);
            if (sites.Count != 1) { throw new InvalidDataException("An MA ZIP must contain exactly one site; split batch snapshots into separate submissions."); }
            var site = sites[0];
            var provenance = $"<p>Submission source: {WebUtility.HtmlEncode(manifest.SourceUrl)}<br>Retrieved at UTC: {WebUtility.HtmlEncode(manifest.RetrievedAtUtc?.ToString("O", CultureInfo.InvariantCulture) ?? "Unknown")}</p>";
            if (manifest.Documents is { Length: > 0 }) {
                provenance += "<p>Documents retained in the original ZIP: " + string.Join(", ", manifest.Documents.Select(WebUtility.HtmlEncode)) + "</p>";
            }
            var description = site.Descriptions[0] with { Description = site.Descriptions[0].Description + provenance };
            return new MarineAggregateArchive(manifest, site with { Descriptions = [description] });
        }
        catch (Exception exception) when (exception is JsonException or DecoderFallbackException or OverflowException) {
            throw new InvalidDataException("Invalid MA archive manifest, GeoJSON or expanded size.", exception);
        }
    }

    private static void ValidatePath(string? path) {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 256 || path.Contains('\\') || path.Contains(':') || path.StartsWith('/')) {
            throw new InvalidDataException("The MA ZIP contains an unsafe path.");
        }
        foreach (var segment in path.Split('/')) {
            if (segment is "" or "." or ".." || segment.EndsWith('.') || segment.EndsWith(' ') || segment.Any(character => !(char.IsAsciiLetterOrDigit(character) || character is '.' or '-' or '_'))) {
                throw new InvalidDataException("MA archive paths must use portable relative filenames without traversal segments.");
            }
        }
    }

    private static async Task<(string Text, long Length)> ReadTextAsync(ZipArchiveEntry entry, int maximumBytes, CancellationToken cancellationToken) {
        if (entry.Length > maximumBytes) { throw new InvalidDataException($"MA entry '{entry.FullName}' exceeds its size limit."); }
        await using var input = entry.Open();
        using var output = new MemoryStream();
        await CopyBoundedAsync(input, output, maximumBytes, cancellationToken).ConfigureAwait(false);
        return (new UTF8Encoding(false, true).GetString(output.GetBuffer(), 0, checked((int)output.Length)).TrimStart('\uFEFF'), output.Length);
    }

    private static async Task<long> CopyBoundedAsync(Stream input, Stream output, long maximumBytes, CancellationToken cancellationToken) {
        var buffer = new byte[81920];
        long total = 0;
        int count;
        while ((count = await input.ReadAsync(buffer.AsMemory(), cancellationToken).ConfigureAwait(false)) != 0) {
            total += count;
            if (total > maximumBytes) { throw new InvalidDataException("The MA archive or an expanded entry exceeds its size limit."); }
            await output.WriteAsync(buffer.AsMemory(0, count), cancellationToken).ConfigureAwait(false);
        }
        return total;
    }
}

/// <summary>Requires an explicit UTC offset for known source retrieval timestamps.</summary>
public sealed class MarineAggregateUtcConverter : JsonConverter<DateTimeOffset?>
{
    /// <inheritdoc />
    public override DateTimeOffset? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType == JsonTokenType.Null) { return null; }
        if (reader.TokenType != JsonTokenType.String) { throw new JsonException("retrievedAtUtc must be a UTC ISO timestamp or null."); }
        var text = reader.GetString();
        if (text is null || !(text.EndsWith('Z') || text.EndsWith("+00:00", StringComparison.Ordinal))
            || !reader.TryGetDateTimeOffset(out var timestamp) || timestamp.Offset != TimeSpan.Zero) {
            throw new JsonException("retrievedAtUtc must be null or an ISO timestamp with an explicit UTC offset.");
        }
        return timestamp;
    }

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, DateTimeOffset? value, JsonSerializerOptions options) {
        if (value.HasValue) { writer.WriteStringValue(value.Value.ToUniversalTime()); }
        else { writer.WriteNullValue(); }
    }
}
