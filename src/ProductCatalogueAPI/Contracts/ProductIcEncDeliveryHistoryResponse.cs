namespace ProductCatalogueAPI.Contracts;

public sealed record ProductIcEncDeliveryHistoryResponse(
    string DatasetName, string ProductSpecification, string Availability, bool? HasMore,
    IReadOnlyList<ProductIcEncDeliveryHistoryItem> Items)
{
    public static ProductIcEncDeliveryHistoryResponse Unavailable(string datasetName, string specification) =>
        new(datasetName, specification, "Unavailable", null, []);
}

public sealed record ProductIcEncDeliveryHistoryItem(
    Guid DeliveryId, int Edition, int Update, DateTime ReservedAtUtc, DateTime? CompletedAtUtc,
    string? TransportStatus, ProductIcEncDeliveryDecision? Decision, string ReportsAvailability,
    IReadOnlyList<ProductIcEncDeliveryReport> Reports);

public sealed record ProductIcEncDeliveryDecision(string Outcome, string? Source, DateTime? RecordedAtUtc);

public sealed record ProductIcEncDeliveryReport(
    Guid ArtifactId, string FileName, DateTime StoredAtUtc, string DownloadUrl, bool FromDecisionEmail);
