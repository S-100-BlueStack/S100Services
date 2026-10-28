namespace ProductCatalogueAPI.Data.Models;

/// <summary>Audit persistence only; never operation ownership or Product state.</summary>
public sealed record ProductHistoryEventRecord
{
    public Guid Id { get; init; }
    public Guid OperationId { get; init; }
    public Guid? StateRecordId { get; init; }
    public string DatasetName { get; init; } = string.Empty;
    public string EventType { get; init; } = string.Empty;
    // Strings deliberately preserve future persisted contract values on reads.
    public string? Outcome { get; init; }
    public string? Code { get; init; }
    public string? SafeMessage { get; init; }
    public string? CorrelationId { get; init; }
    public string? JobId { get; init; }
    public string? ExportTarget { get; init; }
    public string? OperationMetadataJson { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
    public DateTime? ExecutionStartedAtUtc { get; init; }
    public DateTime? FinalizedAtUtc { get; init; }
    public DateTime? OccurredAtUtc { get; init; }
}
