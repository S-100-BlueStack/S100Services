using System.IO.Compression;
using System.Text;

namespace DataCatalague.Api.PackageTypes;

/// <summary>Reads DataCatalogue submissions from WorkZone cases without extracting files or initializing ArcGIS.</summary>
public static class WorkZoneArchive
{
    /// <summary>Maximum compressed ZIP size, 16 MiB.</summary>
    public const int MaximumArchiveBytes = 16 * 1024 * 1024;
    /// <summary>Maximum cumulative expanded size, 64 MiB.</summary>
    public const int MaximumExpandedBytes = 64 * 1024 * 1024;

    /// <summary>Reads required root workzone.json and aoi.geojson; manifest-declared case documents stay in the original ZIP.</summary>
    /// <param name="stream">The ZIP at its current position; the caller retains ownership.</param>
    /// <param name="cancellationToken">Cancels bounded archive and expanded-entry reads.</param>
    /// <returns>The validated package metadata, description and geometry.</returns>
    /// <exception cref="InvalidDataException">The archive is unsafe, oversized or violates the WorkZone contract.</exception>
    public static async Task<WorkZone> ReadAsync(Stream stream, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(stream);
        try {
            using var bytes = new MemoryStream();
            await CopyBoundedAsync(stream, bytes, MaximumArchiveBytes, cancellationToken).ConfigureAwait(false);
            bytes.Position = 0;
            using var archive = new ZipArchive(bytes, ZipArchiveMode.Read, leaveOpen: true);
            if (archive.Entries.Count is 0 or > 100) { throw new InvalidDataException("A WorkZone ZIP must contain between 1 and 100 entries."); }
            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var files = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
            long declaredSize = 0;
            foreach (var entry in archive.Entries) {
                cancellationToken.ThrowIfCancellationRequested();
                var directory = entry.FullName.EndsWith('/');
                var path = directory ? entry.FullName[..^1] : entry.FullName;
                ValidatePath(path);
                if (!paths.Add(path) || ((entry.ExternalAttributes >> 16) & 0xf000) == 0xa000) {
                    throw new InvalidDataException("The WorkZone ZIP contains duplicate paths or symbolic links.");
                }
                declaredSize = checked(declaredSize + entry.Length);
                if (declaredSize > MaximumExpandedBytes) { throw new InvalidDataException("The expanded WorkZone ZIP exceeds 64 MiB."); }
                if (directory) {
                    if ((path != "documents" && !path.StartsWith("documents/", StringComparison.Ordinal)) || entry.Length != 0) {
                        throw new InvalidDataException("WorkZone ZIP directories must be empty entries under documents/.");
                    }
                }
                else {
                    if (path is not ("workzone.json" or "aoi.geojson") && !path.StartsWith("documents/", StringComparison.Ordinal)) {
                        throw new InvalidDataException("A WorkZone ZIP requires root workzone.json and aoi.geojson; additional files belong under documents/.");
                    }
                    files.Add(path, entry);
                }
            }
            if (!files.TryGetValue("workzone.json", out var metadataEntry) || !files.TryGetValue("aoi.geojson", out var geometryEntry)) {
                throw new InvalidDataException("A WorkZone ZIP requires root workzone.json and aoi.geojson files.");
            }
            // Reject file/directory collisions even though no paths are extracted here.
            foreach (var path in paths) {
                var separator = path.IndexOf('/');
                while (separator >= 0) {
                    if (files.ContainsKey(path[..separator])) { throw new InvalidDataException("A WorkZone ZIP path cannot be both a file and a directory."); }
                    separator = path.IndexOf('/', separator + 1);
                }
            }
            var metadata = await ReadTextAsync(metadataEntry, 64 * 1024, cancellationToken).ConfigureAwait(false);
            var geometry = await ReadTextAsync(geometryEntry, 8 * 1024 * 1024, cancellationToken).ConfigureAwait(false);
            long expandedSize = metadata.Length + geometry.Length;
            foreach (var file in files.Values.Where(entry => entry.FullName.StartsWith("documents/", StringComparison.Ordinal))) {
                await using var input = file.Open();
                expandedSize += await CopyBoundedAsync(input, Stream.Null, MaximumExpandedBytes - expandedSize, cancellationToken).ConfigureAwait(false);
            }
            cancellationToken.ThrowIfCancellationRequested();
            var submission = WorkZone.Parse(metadata.Text, geometry.Text);
            var referencedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var document in submission.Manifest.Documents ?? []) {
                if (document.File is not { } path) { continue; }
                ValidatePath(path);
                if (!path.StartsWith("documents/", StringComparison.Ordinal) || !referencedFiles.Add(path)
                    || !files.TryGetValue(path, out var entry) || entry.FullName != path) {
                    throw new InvalidDataException("Each WorkZone document file must reference a distinct existing file under documents/ using its exact ZIP path.");
                }
            }
            if (files.Keys.Any(path => path.StartsWith("documents/", StringComparison.Ordinal) && !referencedFiles.Contains(path))) {
                throw new InvalidDataException("Every included WorkZone document file must be declared in workzone.json documents.");
            }
            return submission;
        }
        catch (Exception exception) when (exception is DecoderFallbackException or OverflowException) {
            throw new InvalidDataException("Invalid WorkZone archive encoding or expanded size.", exception);
        }
    }

    private static void ValidatePath(string path) {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 256 || path.Contains('\\') || path.Contains(':') || path.StartsWith('/')) {
            throw new InvalidDataException("The WorkZone ZIP contains an unsafe path.");
        }
        foreach (var segment in path.Split('/')) {
            if (segment is "" or "." or ".." || segment.EndsWith('.') || segment.EndsWith(' ')
                || segment.Any(character => !(char.IsAsciiLetterOrDigit(character) || character is '.' or '-' or '_'))) {
                throw new InvalidDataException("WorkZone ZIP paths must be portable relative filenames without traversal segments.");
            }
        }
    }

    private static async Task<(string Text, long Length)> ReadTextAsync(ZipArchiveEntry entry, int maximumBytes, CancellationToken cancellationToken) {
        if (entry.Length > maximumBytes) { throw new InvalidDataException($"WorkZone entry '{entry.FullName}' exceeds its size limit."); }
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
            if (total > maximumBytes) { throw new InvalidDataException("The WorkZone archive or an expanded entry exceeds its size limit."); }
            await output.WriteAsync(buffer.AsMemory(0, count), cancellationToken).ConfigureAwait(false);
        }
        return total;
    }
}