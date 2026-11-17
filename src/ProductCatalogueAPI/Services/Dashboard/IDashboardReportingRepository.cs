using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Dashboard;

/// <summary>Reads reporting evidence without modifying workflow or delivery state.</summary>
public interface IDashboardReportingRepository
{
    /// <summary>Loads the exact UTC reporting interval and optional dataset scope.</summary>
    Task<DashboardReportingSnapshot> LoadAsync(DateTime fromUtc, DateTime toUtc, string? datasetName, CancellationToken cancellationToken);
}

/// <summary>Lightweight SQL projections; artifact content and email bodies are never loaded.</summary>
public sealed record DashboardReportingSnapshot(
    IReadOnlyList<DashboardDeliveryRecord> Deliveries,
    IReadOnlyList<DashboardTrackRecord> Tracks,
    IReadOnlyList<DashboardArtifactRecord> Artifacts);

public sealed class DashboardDeliveryRecord
{
    public Guid Id { get; set; }
    public Guid RevisionId { get; set; }
    public string DatasetName { get; set; } = string.Empty;
    public string ProductSpecification { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool IsSimulation { get; set; }
    public DateTime ReservedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? AcknowledgedAtUtc { get; set; }
}

public sealed class DashboardTrackRecord
{
    public Guid TrackId { get; set; }
    public string DatasetName { get; set; } = string.Empty;
    public string ProductSpecification { get; set; } = string.Empty;
    public ProductState State { get; set; }
    public bool IsManuallyFrozen { get; set; }
}

public sealed class DashboardArtifactRecord
{
    public Guid Id { get; set; }
    public Guid TrackId { get; set; }
    public Guid? RevisionId { get; set; }
    public string DatasetName { get; set; } = string.Empty;
    public string ProductSpecification { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public int? Edition { get; set; }
    public int? Update { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
