using static ProductCatalogueAPI.Models.RequestTypes;

namespace ProductCatalogueAPI.Services.Operations
{
    public interface IExportOperationService
    {
        Task<ExportOperationResult> ExecuteNewEditionAsync(
            string datasetName,
            ExportFormat exportTarget,
            string? user,
            CancellationToken cancellationToken = default,
            Action? beforeMutation = null
        );

        Task<ExportOperationResult> ExecuteRollbackAsync(
            string datasetName,
            CancellationToken cancellationToken = default,
            Action? beforeMutation = null
        );
    }
}
