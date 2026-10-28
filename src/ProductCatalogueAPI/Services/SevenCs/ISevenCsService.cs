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
    }
}
