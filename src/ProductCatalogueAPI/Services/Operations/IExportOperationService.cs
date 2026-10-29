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

    /// <summary>Discards both exact eligible package members atomically, preserves replay, then cleans their replaceable outputs.</summary>
    /// <param name="packageId">The snapshot identity inspected while both Product locks are held.</param>
    /// <param name="cancellationToken">Cancels SQL work before commit; a committed discard retains durable replay.</param>
    /// <returns>True after both discards commit; false when either member or its delivery is protected.</returns>
    Task<bool> ExecutePackageRefreshDiscardAsync(Guid packageId, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("Atomic ENC package refresh is unavailable.");

    /// <summary>Discards an unverified candidate without changing S-128; an automatic refresh can retain the scan bound.</summary>
    Task<ExportOperationResult> ExecuteDiscardAsync(string datasetName, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null, bool preservePackageScanBound = false);
}
