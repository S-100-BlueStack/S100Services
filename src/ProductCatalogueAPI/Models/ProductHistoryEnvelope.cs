using System.Text.Json;
using ProductCatalogueAPI.Data.Models;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace ProductCatalogueAPI.Models;

public sealed class ProductHistoryEnvelope : ApiResponse<ProductHistoryResponse[]>
{
    public ProductHistoryEventResponse[] Events { get; set; } = [];
    public int EventTotalHits { get; set; }
}

public sealed class ProductHistoryEventResponse
{
    public Guid Id { get; init; }
    public string DatasetName { get; init; } = string.Empty;
    public string EventType { get; init; } = string.Empty;
    public string? Outcome { get; init; }
    public string? Code { get; init; }
    public string? SafeMessage { get; init; }
    public Guid OperationId { get; init; }
    public string? JobId { get; init; }
    public string? CorrelationId { get; init; }
    public Guid? StateRecordId { get; init; }
    public string? ExportTarget { get; init; }
    public IReadOnlyDictionary<string, string?>? OperationMetadata { get; init; }
    public DateTime? OccurredAtUtc { get; init; }

    public static ProductHistoryEventResponse FromRecord(ProductHistoryEventRecord record) => new()
    {
        Id = record.Id,
        DatasetName = record.DatasetName,
        EventType = record.EventType,
        Outcome = record.Outcome,
        Code = record.Code,
        SafeMessage = record.SafeMessage,
        OperationId = record.OperationId,
        JobId = record.JobId,
        CorrelationId = record.CorrelationId,
        StateRecordId = record.StateRecordId,
        ExportTarget = record.ExportTarget,
        OperationMetadata = ReadMetadata(record.OperationMetadataJson),
        // SQL datetime2 carries UTC by contract, but Dapper returns DateTimeKind.Unspecified.
        OccurredAtUtc = record.OccurredAtUtc.HasValue
            ? DateTime.SpecifyKind(record.OccurredAtUtc.Value, DateTimeKind.Utc) : null
    };

    private static IReadOnlyDictionary<string, string?>? ReadMetadata(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<Dictionary<string, string?>>(json); }
        catch (JsonException) { return null; } // A future metadata shape must not hide its event.
    }
}
