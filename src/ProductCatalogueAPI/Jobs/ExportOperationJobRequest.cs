using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Jobs
{
    /// <summary>Persists the operator intent and source version checked before background execution.</summary>
    /// <param name="DatasetName">The product name, or the S-101 source name for a package build.</param>
    /// <param name="OperationType">The requested candidate operation.</param>
    /// <param name="ProductSpecification">The canonical source product specification.</param>
    /// <param name="ExpectedEdition">Published edition observed when queued.</param>
    /// <param name="ExpectedUpdate">Published update observed when queued.</param>
    /// <param name="CorrelationId">The HTTP trace carried into worker logs.</param>
    /// <param name="CreatedAtUtc">The queue request time.</param>
    /// <param name="OperationId">The durable operation identity.</param>
    /// <param name="BuildPackage">Creates both ENC members from one snapshot; defaults to false for existing persisted jobs.</param>
    public sealed record ExportOperationJobRequest(
        string DatasetName,
        ExportOperationType OperationType,
        string? ProductSpecification,
        int? ExpectedEdition,
        int? ExpectedUpdate,
        string CorrelationId,
        DateTimeOffset CreatedAtUtc,
        Guid OperationId = default,
        bool BuildPackage = false
    );
}
