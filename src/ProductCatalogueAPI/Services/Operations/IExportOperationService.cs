using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>
/// Coordinates SQL-authoritative candidate creation without publishing unverified data to S-128.
/// </summary>
public interface IExportOperationService
{
    /// <summary>Builds and validates a new edition or update candidate for one independent product track.</summary>
    Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null);

    /// <summary>Builds one package candidate from the exact YAML snapshot already persisted for both encoders.</summary>
    Task<ExportOperationResult> ExecutePackageExportAsync(string datasetName, ExportRevisionType revisionType, string datasetYaml, string changeSummaryYaml, CancellationToken cancellationToken = default);

    /// <summary>Discards an unverified candidate without changing S-128; an automatic refresh can retain the scan bound.</summary>
    Task<ExportOperationResult> ExecuteDiscardAsync(string datasetName, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null, bool preservePackageScanBound = false);
}
