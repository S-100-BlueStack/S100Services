using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>
/// Coordinates SQL-authoritative candidate creation without publishing unverified data to S-128.
/// </summary>
public interface IExportOperationService
{
    /// <summary>Builds and validates a new edition or update candidate for one independent product track.</summary>
    Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ProductSpecification productSpecification, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null);

    /// <summary>Cancels an unverified candidate without changing the public S-128 catalogue.</summary>
    Task<ExportOperationResult> ExecuteCancelExportAsync(string datasetName, ProductSpecification productSpecification, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null);
}
