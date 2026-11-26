using System.Globalization;
using System.IO.Compression;
using System.Xml;
using System.Xml.Linq;

namespace ProductCatalogueAPI.Services.BathymetricSurfaces;

/// <summary>Checks the filesystem layout of a single-dataset S-100 exchange set for the bathymetric intake.</summary>
internal static class BathymetricExchangeSet
{
    private const string Root = "S100_ROOT/";
    private const string ProductDirectory = Root + "S-102/";
    private const string DatasetDirectory = ProductDirectory + "DATASET_FILES/";
    private const string CataloguesDirectory = ProductDirectory + "CATALOGUES/";
    private const string Catalogue = Root + "CATALOG.XML";
    private const string Signature = Root + "CATALOG.SIGN";
    private const long MaximumExpandedBytes = 256L * 1024 * 1024;

    /// <summary>Returns safe entries under the exchange-set root in the order in which they can be staged.</summary>
    /// <param name="archive">Open ZIP archive supplied by the producer.</param>
    /// <param name="datasetName">Expected catalogue dataset name.</param>
    /// <returns>Files to stage while preserving the S100_ROOT directory structure.</returns>
    /// <exception cref="InvalidDataException">The ZIP layout, filename, or expanded size is incompatible with this workflow.</exception>
    internal static IReadOnlyList<ZipArchiveEntry> GetFiles(ZipArchive archive, string datasetName) {
        if (archive.Entries.Count > 128)
            throw new InvalidDataException("The exchange set contains too many entries.");

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var files = new List<ZipArchiveEntry>();
        var total = 0L;
        foreach (var entry in archive.Entries) {
            var path = entry.FullName;
            var isDirectory = path.EndsWith('/');
            if (!IsSafePath(isDirectory ? path[..^1] : path))
                throw new InvalidDataException("The exchange set contains an unsafe path.");
            if (isDirectory)
                continue;

            if ((path != Catalogue && path != Signature && !path.StartsWith(DatasetDirectory, StringComparison.Ordinal)
                && !path.StartsWith(CataloguesDirectory, StringComparison.Ordinal))
                || !names.Add(path) || path.EndsWith(".vld", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The exchange set contains an unexpected or duplicate file.");

            if (entry.Length > MaximumExpandedBytes - total)
                throw new InvalidDataException("The exchange set exceeds the expanded size limit.");
            total += entry.Length;
            files.Add(entry);
        }

        var datasetFiles = files.Where(file => file.FullName.EndsWith(".h5", StringComparison.OrdinalIgnoreCase)).ToArray();
        if (!files.Any(file => file.FullName == Catalogue && file.Length > 0)
            || !files.Any(file => file.FullName == Signature && file.Length > 0)
            || datasetFiles is not [{ Length: > 0 } dataset]
            || !dataset.FullName.StartsWith(DatasetDirectory, StringComparison.Ordinal)
            || !string.Equals(Path.GetFileNameWithoutExtension(dataset.FullName), BathymetricSurfaceService.DatasetStem(datasetName), StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The exchange set must contain CATALOG.XML, CATALOG.SIGN and the named HDF5 dataset.");

        // Some clients express empty directories explicitly, but a file may never be an ancestor of another entry.
        foreach (var file in files) {
            for (var slash = file.FullName.LastIndexOf('/'); slash >= 0; slash = file.FullName.LastIndexOf('/', slash - 1))
                if (names.Contains(file.FullName[..slash]))
                    throw new InvalidDataException("The exchange set contains a file where a directory is required.");
        }
        return files;
    }

    /// <summary>Checks a producer's single-dataset exchange set and reads its declared edition.</summary>
    /// <param name="archive">Open ZIP archive supplied by the producer.</param>
    /// <param name="datasetName">Expected catalogue dataset name.</param>
    /// <param name="token">Cancels the exchange catalogue read.</param>
    /// <returns>Positive edition in the discovery metadata for the uploaded dataset.</returns>
    /// <exception cref="InvalidDataException">The archive or its catalogue does not describe one matching dataset edition.</exception>
    /// <exception cref="XmlException">The exchange catalogue is malformed XML.</exception>
    internal static async Task<int> ReadEditionAsync(ZipArchive archive, string datasetName, CancellationToken token) {
        var files = GetFiles(archive, datasetName);
        var catalogue = files.Single(file => file.FullName == Catalogue);
        if (catalogue.Length > 1024 * 1024)
            throw new InvalidDataException("The single-dataset exchange catalogue exceeds 1 MiB.");

        using var stream = catalogue.Open();
        using var reader = XmlReader.Create(stream, new XmlReaderSettings {
            Async = true, DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 1024 * 1024
        });
        var xml = await XDocument.LoadAsync(reader, LoadOptions.None, token);
        var datasets = xml.Descendants().Where(element => element.Name.LocalName == "S100_DatasetDiscoveryMetadata").ToArray();
        if (datasets is not [var dataset])
            throw new InvalidDataException("The exchange catalogue must contain one dataset discovery record.");

        var fileName = dataset.Elements().FirstOrDefault(element => element.Name.LocalName == "fileName")?.Value.Trim();
        var expected = BathymetricSurfaceService.DatasetStem(datasetName) + ".H5";
        var edition = dataset.Elements().FirstOrDefault(element => element.Name.LocalName == "editionNumber")?.Value.Trim();
        if (!string.Equals(fileName?.Split('/')[^1], expected, StringComparison.OrdinalIgnoreCase)
            || !int.TryParse(edition, NumberStyles.None, CultureInfo.InvariantCulture, out var number) || number < 1)
            throw new InvalidDataException("The exchange catalogue must name the uploaded HDF5 dataset and declare a positive edition.");

        return number;
    }

    /// <summary>Rejects ZIP paths that could escape the exchange-set root or alter FTP commands.</summary>
    /// <param name="path">Relative entry name without the trailing directory slash.</param>
    /// <returns>Whether each path component is portable and safe.</returns>
    private static bool IsSafePath(string path) =>
        path is { Length: > 0 and <= 240 }
        && path.Split('/').All(part => part.Length != 0 && !part.EndsWith('.')
            && part.All(ch => char.IsAsciiLetterOrDigit(ch) || ch is '_' or '-' or '.'));
}
