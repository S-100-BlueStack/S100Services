using ProductCatalogueAPI.Data.Models;
using static ProductCatalogueAPI.Services.SevenCs.SevenCsService;

namespace ProductCatalogueAPI.Services.SevenCs
{
    /// <summary>Represents one diagnostic file downloaded from SevenCs.</summary>
    public sealed record SevenCsDiagnosticArtifact(string FileName, string MediaType, byte[] Content);

    /// <summary>Combines the validation summary with any diagnostic files SevenCs made available.</summary>
    public sealed record SevenCsValidationResult(SummaryResponse Summary, IReadOnlyList<SevenCsDiagnosticArtifact> Diagnostics);

    public interface ISevenCsService
    {
        /// <summary>Validates one generated S-101 candidate without reading its version from S-128.</summary>
        Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default);

        /// <summary>Validates a generated S-57 or S-101 candidate using its independent output layout.</summary>
        /// <param name="datasetName">The target cell name, not its mapped source product name.</param>
        /// <param name="productSpecification">The exported format; only S-57 and S-101 are supported.</param>
        /// <param name="edition">The SQL candidate edition, independent of the published S-128 version.</param>
        /// <param name="update">The SQL candidate update used to locate the candidate output.</param>
        /// <param name="outputPath">The configured export root shared by both product tracks.</param>
        /// <param name="cancellationToken">Cancels uploads, analysis polling and diagnostic downloads.</param>
        /// <returns>The validation summary and available VLD/shapefile diagnostic artifacts.</returns>
        /// <exception cref="NotSupportedException">The exported format is not supported by this validator.</exception>
        Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, ProductSpecification productSpecification, int edition, int update, string outputPath, CancellationToken cancellationToken = default);
    }
}
