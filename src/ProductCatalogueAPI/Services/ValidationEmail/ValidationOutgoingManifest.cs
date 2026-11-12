using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Immutable actual dataset filenames and checksums captured before delivery leaves the process.</summary>
public static class ValidationOutgoingManifest
{
    private static readonly uint[] CrcTable = BuildCrcTable();
    /// <summary>One dataset member; auxiliary files remain in the original exchange-set artifact.</summary>
    /// <param name="FileName">Actual basename including update suffix.</param>
    /// <param name="Sha256">Hash of the exact transmitted bytes.</param>
    /// <param name="Crc">S-57 CRC as defined by IHO S-57 Appendix B.1 Annex B.</param>
    public sealed record Entry(string FileName, byte[] Sha256, string? Crc);

    /// <summary>Reads the same exchange-set root as the FTPS transport, without extracting files.</summary>
    /// <param name="exchangeSet">Stored candidate ZIP.</param>
    /// <param name="specification">S57 or S101.</param>
    /// <param name="datasetName">Canonical outgoing product name.</param>
    /// <param name="update">Revision update, validated against the actual filename.</param>
    /// <returns>Actual dataset members, including the exact outgoing update; ambiguous archives are rejected before sending.</returns>
    public static Entry[] Read(byte[] exchangeSet, string specification, string datasetName, int update) {
        if (update is < 0 or > 999 || string.IsNullOrWhiteSpace(datasetName) || !ValidationDatasetFile.IsDatasetFile(datasetName + ".000"))
            throw new ArgumentException("A supported exact dataset name and three-digit update are required.");
        using var memory = new MemoryStream(exchangeSet, false);
        using var zip = new ZipArchive(memory, ZipArchiveMode.Read);
        var root = specification == "S57" ? "ENC_ROOT/" : specification == "S101" ? "S100_ROOT/" : throw new ArgumentException("Only S57 and S101 are supported.", nameof(specification));
        var files = zip.Entries.Where(e => e.FullName.Replace('\\', '/').StartsWith(root, StringComparison.OrdinalIgnoreCase) && ValidationDatasetFile.IsDatasetFile(GetFileName(e))).ToArray();
        var expected = datasetName + "." + update.ToString("000", CultureInfo.InvariantCulture);
        var targets = files.Where(f => GetFileName(f).Equals(expected, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (targets.Length != 1 || files.Any(f => f.Length > 256 * 1024 * 1024 || !GetFileName(f).StartsWith(datasetName + ".", StringComparison.OrdinalIgnoreCase) || int.Parse(GetFileName(f)[^3..], CultureInfo.InvariantCulture) > update) ||
            files.Select(f => GetFileName(f).ToUpperInvariant()).Distinct().Count() != files.Length || files.Sum(f => f.Length) > 512 * 1024 * 1024)
            throw new InvalidDataException($"The exchange set must contain the exact outgoing dataset filename. Expected: {expected}. Root: {root}. DatasetFiles: {string.Join(", ", files.Take(10).Select(GetFileName))}.");
        return files.Select(file => ReadEntry(file, specification)).ToArray();
    }

    /// <summary>Legacy S-57 ZIPs contain Windows separators; ZipArchiveEntry.Name is not a portable normalization boundary.</summary>
    private static string GetFileName(ZipArchiveEntry entry) {
        var path = entry.FullName.Replace('\\', '/');
        if (path.Split('/').Any(part => part is "." or ".." || part.Contains(':')) || path.StartsWith('/'))
            throw new InvalidDataException("The exchange set contains an unsafe dataset path.");
        return path[(path.LastIndexOf('/') + 1)..];
    }

    private static Entry ReadEntry(ZipArchiveEntry file, string specification) {
        using var content = file.Open();
        using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[65536];
        uint crc = 0xffffffff;
        int count;
        long total = 0;
        while ((count = content.Read(buffer)) > 0) {
            total += count;
            if (total > 256 * 1024 * 1024) throw new InvalidDataException("The dataset exceeds the manifest size limit.");
            sha.AppendData(buffer, 0, count);
            for (var index = 0; index < count; index++) crc = CrcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >> 8);
        }
        crc ^= 0xffffffff;
        if (crc != file.Crc32) throw new InvalidDataException("Dataset ZIP checksum does not match the transmitted bytes.");
        // S-101 checksum semantics are not inferred from S-57. An S-101 CRC-bearing notice needs review until a verified adapter exists.
        return new(GetFileName(file).ToUpperInvariant(), sha.GetHashAndReset(), specification == "S57" ? crc.ToString("X8", CultureInfo.InvariantCulture) : null);
    }

    private static uint[] BuildCrcTable() {
        var table = new uint[256];
        for (uint index = 0; index < table.Length; index++) {
            var value = index;
            for (var bit = 0; bit < 8; bit++) value = (value >> 1) ^ ((value & 1) != 0 ? 0xedb88320u : 0);
            table[index] = value;
        }
        return table;
    }
}
