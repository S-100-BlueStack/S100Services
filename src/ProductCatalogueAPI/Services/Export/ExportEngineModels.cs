using ProductCatalogueAPI.Data.Models;
using System.Globalization;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Contains all immutable input required by an export engine.
/// </summary>
public sealed record ExportEngineRequest(string DatasetName, ProductSpecification ProductSpecification, int Edition, int Update, string OutputRoot, string DatasetYaml, string? PreviousIndex = null, string? SourceDatasetName = null);

/// <summary>
/// Identifies output belonging to one candidate and one independent product track.
/// </summary>
public sealed record ExportOutputIdentity(string DatasetName, ProductSpecification ProductSpecification, int Edition, int Update, string OutputRoot);

/// <summary>
/// Represents one engine-produced artifact suitable for durable SQL storage.
/// </summary>
public sealed record ExportEngineArtifact(ProductArtifactKind Kind, string FileName, string MediaType, byte[] Content, string? MetadataJson = null);

/// <summary>
/// Represents the filesystem location and durable artifacts produced by an engine.
/// </summary>
public sealed record ExportEngineResult(string OutputDirectory, IReadOnlyList<ExportEngineArtifact> Artifacts);

/// <summary>
/// Defines stable filesystem locations for independently generated product candidates.
/// </summary>
public static class ExportOutputPath
{
    /// <summary>
    /// Gets the root directory for a product candidate export.
    /// </summary>
    /// <param name="outputRoot">The configured root export directory.</param>
    /// <param name="datasetName">The authoritative dataset name.</param>
    /// <param name="productSpecification">The product specification being exported.</param>
    /// <param name="edition">The candidate edition number.</param>
    /// <param name="update">The candidate update number.</param>
    /// <returns>The candidate export directory.</returns>
    public static string GetCandidateDirectory(string outputRoot, string datasetName, ProductSpecification productSpecification, int edition, int update) {
        Validate(outputRoot, datasetName, edition, update);

        // The edition root owns staging input and index files; the compiler's
        // exchange-set output is placed in a dataset-specific subdirectory.
        if (productSpecification == ProductSpecification.S101)
            return Path.Combine(outputRoot, datasetName, edition.ToString(CultureInfo.InvariantCulture));

        return Path.Combine(outputRoot, datasetName, productSpecification.ToString(), edition.ToString(CultureInfo.InvariantCulture), update.ToString("000", CultureInfo.InvariantCulture));
    }

    /// <summary>
    /// Gets the S-101 exchange-set root emitted beneath the compiler's dataset-specific directory.
    /// This is distinct from the edition directory containing staging YAML and index files.
    /// </summary>
    public static string GetS101ExchangeSetDirectory(string outputRoot, string datasetName, int edition, int update) {
        return Path.Combine(GetCandidateDirectory(outputRoot, datasetName, ProductSpecification.S101, edition, update), datasetName, "S100_ROOT");
    }

    /// <summary>
    /// Gets the S-101 dataset-files directory produced by the compiler inside its exchange set.
    /// </summary>
    /// <param name="outputRoot">The configured root export directory.</param>
    /// <param name="datasetName">The authoritative dataset name.</param>
    /// <param name="edition">The candidate edition number.</param>
    /// <param name="update">The candidate update number used for input validation.</param>
    /// <returns>The directory containing the S-101 <c>.000</c> and update files.</returns>
    public static string GetS101DatasetFilesDirectory(string outputRoot, string datasetName, int edition, int update) {
        return Path.Combine(GetS101ExchangeSetDirectory(outputRoot, datasetName, edition, update), "S-101", "DATASET_FILES");
    }

    /// <summary>Finds the requested S-57 cell beneath its isolated compiler output directory.</summary>
    /// <param name="outputRoot">The configured export root.</param>
    /// <param name="datasetName">The S-57 target cell name resolved through ProductMapping.</param>
    /// <param name="edition">The candidate edition number.</param>
    /// <param name="update">The candidate update number identifying its isolated output.</param>
    /// <returns>The directory containing the unique, non-empty base cell and any adjacent updates.</returns>
    /// <exception cref="InvalidOperationException">The requested base cell is missing, empty or ambiguous.</exception>
    /// <remarks>Supports flat and nested exchange-set layouts without selecting another cell or an older candidate.</remarks>
    public static string GetS57DatasetFilesDirectory(string outputRoot, string datasetName, int edition, int update) {
        var candidateDirectory = GetCandidateDirectory(outputRoot, datasetName, ProductSpecification.S57, edition, update);
        var baseFiles = Directory.Exists(candidateDirectory)
            ? Directory.EnumerateFiles(candidateDirectory, "*.000", SearchOption.AllDirectories)
                .Where(path => string.Equals(Path.GetFileNameWithoutExtension(path), datasetName, StringComparison.OrdinalIgnoreCase))
                .Take(2).ToArray()
            : Array.Empty<string>();
        if (baseFiles.Length != 1 || new FileInfo(baseFiles[0]).Length == 0)
            throw new InvalidOperationException($"The S-57 compiler output must contain one non-empty base dataset for '{datasetName}'.");

        return Path.GetDirectoryName(baseFiles[0])!;
    }

    private static void Validate(string outputRoot, string datasetName, int edition, int update) {
        if (string.IsNullOrWhiteSpace(outputRoot))
            throw new ArgumentException("An export output root is required.", nameof(outputRoot));
        if (string.IsNullOrWhiteSpace(datasetName))
            throw new ArgumentException("A dataset name is required.", nameof(datasetName));
        if (edition < 0)
            throw new ArgumentOutOfRangeException(nameof(edition));
        if (update < 0)
            throw new ArgumentOutOfRangeException(nameof(update));
    }
}

/// <summary>
/// Indicates that a known product/engine structure exists but its encoder is intentionally not implemented yet.
/// </summary>
public sealed class ExportEngineNotImplementedException(ProductSpecification productSpecification)
    : NotSupportedException($"The export engine for {productSpecification} has been scaffolded but is not implemented.")
{
    /// <summary>Gets the unsupported product specification.</summary>
    public ProductSpecification ProductSpecification { get; } = productSpecification;
}
