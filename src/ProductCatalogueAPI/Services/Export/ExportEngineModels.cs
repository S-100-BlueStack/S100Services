using ProductCatalogueAPI.Data.Models;
using System.Globalization;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Contains all immutable input required by an export engine.
/// </summary>
public sealed record ExportEngineRequest(string DatasetName, ProductSpecification ProductSpecification, int Edition, int Update, string OutputRoot, string DatasetYaml, string? PreviousIndex = null);

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
    /// Gets the working directory for one candidate export.
    /// </summary>
    /// <param name="outputRoot">The configured root export directory.</param>
    /// <param name="datasetName">The authoritative dataset name.</param>
    /// <param name="productSpecification">The independently exported product specification.</param>
    /// <param name="edition">The candidate edition number.</param>
    /// <param name="update">The candidate update number.</param>
    /// <returns>The candidate working directory.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="outputRoot"/> or <paramref name="datasetName"/> is empty.</exception>
    /// <exception cref="ArgumentOutOfRangeException">Thrown when <paramref name="edition"/> or <paramref name="update"/> is negative.</exception>
    public static string GetCandidateDirectory(string outputRoot, string datasetName, ProductSpecification productSpecification, int edition, int update) {
        Validate(outputRoot, datasetName, edition, update);

        // S-101 retains the established exchange-set layout consumed by operational tooling and SevenCs.
        if (productSpecification == ProductSpecification.S101)
            return Path.Combine(outputRoot, datasetName, edition.ToString(CultureInfo.InvariantCulture));

        return Path.Combine(outputRoot, datasetName, productSpecification.ToString(), edition.ToString(CultureInfo.InvariantCulture), update.ToString("000", CultureInfo.InvariantCulture));
    }

    /// <summary>
    /// Gets the S-101 dataset-files directory inside an edition exchange set.
    /// </summary>
    /// <param name="outputRoot">The configured root export directory.</param>
    /// <param name="datasetName">The authoritative dataset name.</param>
    /// <param name="edition">The candidate edition number.</param>
    /// <param name="update">The candidate update number used for input validation.</param>
    /// <returns>The directory containing the S-101 <c>.000</c> and update files.</returns>
    public static string GetS101DatasetFilesDirectory(string outputRoot, string datasetName, int edition, int update) => Path.Combine(GetCandidateDirectory(outputRoot, datasetName, ProductSpecification.S101, edition, update), "S100_ROOT", "S-101", "DATASET_FILES");

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
