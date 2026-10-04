using System.Text.Json.Serialization;

namespace ProductCatalogueAPI.Models
{
    public sealed class ExportJobStartResponse
    {
        [JsonPropertyName("jobId")]
        public required string JobId { get; init; }

        [JsonPropertyName("datasetName")]
        public required string DatasetName { get; init; }

        [JsonPropertyName("operationType")]
        public required string OperationType { get; init; }

        [JsonPropertyName("exportTarget")]
        public string? ExportTarget { get; init; }

        [JsonPropertyName("status")]
        public required string Status { get; init; }

        [JsonPropertyName("createdAt")]
        public required DateTimeOffset CreatedAt { get; init; }

        [JsonPropertyName("correlationId")]
        public required string CorrelationId { get; init; }

        [JsonPropertyName("statusUrl")]
        public required string StatusUrl { get; init; }

        [JsonPropertyName("mode")]
        public string? Mode { get; init; }

        [JsonPropertyName("deliveryStatus")]
        public string? DeliveryStatus { get; init; }

        [JsonPropertyName("message")]
        public string? Message { get; init; }
    }

    public sealed class ExportJobStatusResponse
    {
        [JsonPropertyName("jobId")]
        public required string JobId { get; init; }

        [JsonPropertyName("datasetName")]
        public required string DatasetName { get; init; }

        [JsonPropertyName("operationType")]
        public required string OperationType { get; init; }

        [JsonPropertyName("exportTarget")]
        public string? ExportTarget { get; init; }

        [JsonPropertyName("status")]
        public required string Status { get; init; }

        [JsonPropertyName("createdAt")]
        public required DateTimeOffset CreatedAt { get; init; }

        [JsonPropertyName("startedAt")]
        public DateTimeOffset? StartedAt { get; init; }

        [JsonPropertyName("completedAt")]
        public DateTimeOffset? CompletedAt { get; init; }

        [JsonPropertyName("message")]
        public string? Message { get; init; }

        [JsonPropertyName("mode")]
        public string? Mode { get; init; }

        [JsonPropertyName("operationOutcome")]
        public string? OperationOutcome { get; init; }

        [JsonPropertyName("deliveryStatus")]
        public string? DeliveryStatus { get; init; }

        [JsonPropertyName("correlationId")]
        public required string CorrelationId { get; init; }

        [JsonPropertyName("warning")]
        public ExportJobWarningResponse? Warning { get; init; }

        [JsonPropertyName("error")]
        public ExportJobErrorResponse? Error { get; init; }
    }

    public sealed class ExportJobWarningResponse
    {
        [JsonPropertyName("code")]
        public required string Code { get; init; }

        [JsonPropertyName("message")]
        public required string Message { get; init; }
    }

    public sealed class ExportJobErrorResponse
    {
        [JsonPropertyName("code")]
        public required string Code { get; init; }

        [JsonPropertyName("message")]
        public required string Message { get; init; }
    }
}
