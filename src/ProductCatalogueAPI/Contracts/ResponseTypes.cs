using ProductCatalogueAPI.Models;
using System.Text.Json.Serialization;

namespace ProductCatalogueAPI.Contracts
{
    public static class ResponseTypes
    {
        public class ApiResponse
        {
            public bool Success { get; set; } = true;
            public string? Message { get; set; }
            public int? TotalHits { get; set; }
            public double? DurationMs { get; set; }
            public DateTime Timestamp { get; private set; } = DateTime.UtcNow;
        }

        public class ApiResponse<T> : ApiResponse
        {
            public T? Data { get; set; }
        }

        public class AOIResponse
        {
            public required string Geometry { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public required Attributes? Attributes { get; set; }
        }

        public class Attributes
        {
            /// <summary>Gets the ENC package represented by this S-101 AOI.</summary>
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public EncPackageResponse? Package { get; set; }
            /// <summary>Gets the independent workflow of a bathymetric AOI.</summary>
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public ExternalProductExportResponse? BathymetricSurface { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public string? DatasetName { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public string? ProductSpecification { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public int? DisplayScale { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public int? UsageBand { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public int? Edition { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public int? Update { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public DateOnly? IssueDate { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public ProductStatus? Status { get; set; }
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public string? ErrorMessage { get; set; }
        }

        public class ProductResponse
        {
            /// <summary>The aggregate ENC package and its independently versioned members, when applicable.</summary>
            [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
            public EncPackageResponse? Package { get; set; }
            /// <summary>Gets the current S-57 product, even when no export candidate exists.</summary>
            public CurrentElectronicProductResponse? S57 { get; set; }
            /// <summary>Gets the current S-101 product, even when no export candidate exists.</summary>
            public CurrentElectronicProductResponse? S101 { get; set; }
            public string? Name { get; set; }
            public ProductStatus? Status { get; set; }
            public int? UsageBand { get; set; }
            public DateOnly? IssueDate { get; set; }
            public List<ProductExport>? Exports { get; set; }
            public string? ErrorMessage { get; set; }
        }

        /// <summary>Describes the current product version read from the S-128 catalogue.</summary>
        public sealed record CurrentElectronicProductResponse(string Name, int? Edition, int? Update, DateOnly? IssueDate);

        public class ProductHistoryResponse
        {
            public Guid Id { get; set; }
            public required string Name { get; set; }
            public required string ProductSpecification { get; set; }
            public int? Edition { get; set; }
            public int? Update { get; set; }
            public required ProductStatus Status { get; set; }
            public required DateTime From { get; set; }
            public required DateTime To { get; set; }
            public string? Owner { get; set; }
            public string? ErrorCode { get; set; }
            public string? ErrorMessage { get; set; }
            /// <summary>Indicates whether the track currently has a manual freeze hold.</summary>
            public bool IsManuallyFrozen { get; set; }
        }

        public class DashboardResponse
        {
            public DateTimeOffset GeneratedAt { get; set; }
            public DashboardRangeResponse Range { get; set; } = new();
            public DashboardSummaryResponse Summary { get; set; } = new();
            public List<DashboardStatusSummaryItemResponse> StatusSummary { get; set; } = [];
            public List<DashboardOperationSummaryItemResponse> OperationSummary { get; set; } = [];
            public DashboardPagingResponse Paging { get; set; } = new();
            public DashboardFilterOptionsResponse FilterOptions { get; set; } = new();
            public List<DashboardActivityResponse> Activities { get; set; } = [];
            /// <summary>Live and simulated delivery outcomes counted from immutable revision deliveries.</summary>
            public DashboardDistributionSummaryResponse? Distribution { get; set; }
            /// <summary>Current track state, independent of the selected historical range.</summary>
            public DashboardOperationalHealthResponse? OperationalHealth { get; set; }
            /// <summary>Stored report files created within the selected UTC interval.</summary>
            public DashboardReportSummaryResponse? ReportSummary { get; set; }
            /// <summary>Exact Product, specification and revision ownership for available report files.</summary>
            public List<DashboardReportArtifactResponse> ReportArtifacts { get; set; } = [];
            /// <summary>Daily counts from the complete filtered activity set, never just the current page.</summary>
            public List<DashboardActivityTrendResponse> ActivityTrend { get; set; } = [];
            /// <summary>Daily live delivery outcomes, scoped to the reporting interval and product.</summary>
            public List<DashboardDistributionTrendResponse> DistributionTrend { get; set; } = [];
            public List<DashboardProductBreakdownResponse> ProductBreakdown { get; set; } = [];
        }

        public class DashboardDistributionSummaryResponse
        {
            public DashboardDistributionCountsResponse Live { get; set; } = new();
            public DashboardDistributionCountsResponse Simulation { get; set; } = new();
            public List<DashboardDistributionBreakdownResponse> BySpecification { get; set; } = [];
        }

        public class DashboardDistributionCountsResponse
        {
            public int Sent { get; set; }
            public int Accepted { get; set; }
            public int Rejected { get; set; }
            /// <summary>Delivered in the reporting interval and still awaiting a decision.</summary>
            public int Pending { get; set; }
            public int Uncertain { get; set; }
            public decimal? AcceptanceRatePercent { get; set; }
        }

        public class DashboardDistributionBreakdownResponse
        {
            public required string ProductSpecification { get; set; }
            public bool IsSimulation { get; set; }
            public DashboardDistributionCountsResponse Counts { get; set; } = new();
        }

        public class DashboardOperationalHealthResponse
        {
            public DateTimeOffset AsOfUtc { get; set; }
            public int Tracks { get; set; }
            public int OpenErrors { get; set; }
            public int Processing { get; set; }
            public int AwaitingIcEnc { get; set; }
            public int Paused { get; set; }
        }

        public class DashboardReportSummaryResponse
        {
            public int Total { get; set; }
            public int IcEnc { get; set; }
            public int InternalValidation { get; set; }
            public int ValidationDiagnostics { get; set; }
        }

        public class DashboardReportArtifactResponse
        {
            public Guid Id { get; set; }
            public Guid? RevisionId { get; set; }
            public required string DatasetName { get; set; }
            public required string ProductSpecification { get; set; }
            public required string Kind { get; set; }
            public required string FileName { get; set; }
            public DateTimeOffset CreatedAtUtc { get; set; }
            public required string Url { get; set; }
        }

        public class DashboardActivityTrendResponse
        {
            public required string Day { get; set; }
            public int Activities { get; set; }
            public int Failed { get; set; }
            public int Important { get; set; }
        }

        public class DashboardDistributionTrendResponse
        {
            public required string Day { get; set; }
            public int Sent { get; set; }
            public int Accepted { get; set; }
            public int Rejected { get; set; }
        }

        public class DashboardProductBreakdownResponse
        {
            public required string ProductSpecification { get; set; }
            public int Activities { get; set; }
            public int ProductsTouched { get; set; }
            public int Failed { get; set; }
        }

        public class DashboardPagingResponse
        {
            public int? PageSize { get; set; }
            public int Returned { get; set; }
            public int Total { get; set; }
            public bool HasMore { get; set; }
            public string? NextCursor { get; set; }
        }

        public class DashboardFilterOptionsResponse
        {
            public List<DashboardFilterOptionResponse> Types { get; set; } = [];
            public List<DashboardFilterOptionResponse> Statuses { get; set; } = [];
            public List<DashboardFilterOptionResponse> Products { get; set; } = [];
        }

        public class DashboardFilterOptionResponse
        {
            public required string Value { get; set; }
            public required string Label { get; set; }
        }

        public class DashboardRangeResponse
        {
            public DateTimeOffset From { get; set; }
            public DateTimeOffset To { get; set; }
            public string TimeZone { get; set; } = "Europe/Copenhagen";
        }

        public class DashboardSummaryResponse
        {
            public int TotalActivities { get; set; }
            public int ProductsTouched { get; set; }
            public int ImportantChanges { get; set; }
            public int FailedOperations { get; set; }
            public int ReportsAvailable { get; set; }
        }

        public class DashboardStatusSummaryItemResponse
        {
            public required string Status { get; set; }
            public int Count { get; set; }
        }

        public class DashboardOperationSummaryItemResponse
        {
            public required string Type { get; set; }
            public int Count { get; set; }
            public int Failed { get; set; }
        }

        public class DashboardActivityResponse
        {
            public required string Id { get; set; }
            public DateTimeOffset Timestamp { get; set; }
            public required string DatasetName { get; set; }
            public required string ProductName { get; set; }
            public string? ProductSpecification { get; set; }
            public required string Type { get; set; }
            public required string Severity { get; set; }
            public required string Title { get; set; }
            public string? Description { get; set; }
            public required string Status { get; set; }
            public string? Actor { get; set; }
            public int? Edition { get; set; }
            public int? Update { get; set; }
            public DashboardActivityLinksResponse Links { get; set; } = new();
            public List<DashboardActivityDetailResponse> Details { get; set; } = [];
        }

        public class DashboardActivityLinksResponse
        {
            public bool Review { get; set; }
            public bool Analyze { get; set; }
            public bool History { get; set; }
            public List<DashboardReportLinkResponse> IcEncReports { get; set; } = [];
            public List<DashboardReportLinkResponse> InternalValidationReports { get; set; } = [];
        }

        public class DashboardReportLinkResponse
        {
            public required string Id { get; set; }
            public string? Title { get; set; }
            public string? Status { get; set; }
            public DateTimeOffset? GeneratedAt { get; set; }
            public string? Url { get; set; }
        }

        public class DashboardActivityDetailResponse
        {
            public required string Label { get; set; }
            public required string Value { get; set; }
        }

        public sealed record ProductArtifactLinkResponse(Guid Id, string FileName, string MediaType, DateTime CreatedAtUtc, string Url);

        public sealed record ProductArtifactHistoryResponse(
            Guid Id,
            Guid TrackId,
            Guid? RevisionId,
            string DatasetName,
            string ProductSpecification,
            string Kind,
            string FileName,
            string MediaType,
            DateTime CreatedAtUtc,
            string Url);

        public sealed record ProductWorkspaceFreshnessResponse(
            string DatasetName,
            string? Revision,
            bool Available);

        /// <summary>Describes a candidate export for a specific electronic product.</summary>
        /// <param name="Type">Product specification identifier, either S57 or S101.</param>
        public sealed record ProductExport(
            string Type,
            string Name,
            int Edition,
            int? Update,
            ProductStatus Status,
            DateTime Date,
            string? ErrorMessage = default,
            IReadOnlyList<ProductArtifactLinkResponse>? ValidationArtifacts = default);

        public enum ProductStatus : int
        {
            Idle = 1, // Default. No changes detected.
            Exported = 2, // Exported as new edition/update.
            Frozen = 5, // Frozen and awaits manual action.
            InTransit = 6, // Awaiting IC-ENC confirmation.
            Rejected = 7, // Rejected by IC-ENC.
            ChangesDetected = 8,
            Exporting = 9,
            Validating = 10,
            ReadyForDistribution = 11,
            AcceptedForDistribution = 12,
            Published = 13,
            Cancelled = 14,
            Error = 15
        }
    }
}
