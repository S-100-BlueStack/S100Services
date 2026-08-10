using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Jobs
{
    public sealed record ExportOperationJobRequest(
        string DatasetName,
        ExportOperationType OperationType,
        string? ExportTarget,
        int? ExpectedEdition,
        int? ExpectedUpdate,
        string CorrelationId,
        DateTimeOffset CreatedAtUtc
    );
}
