namespace ProductCatalogueAPI.Models
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
            public required Attributes? Attributes { get; set; }
        }

        public class Attributes
        {
            public string? DatasetName { get; set; }
            public int? DisplayScale { get; set; }
            public int? UsageBand { get; set; }
            public int? Edition { get; set; }
            public int? Update { get; set; }
            public DateOnly? IssueDate { get; set; }
            public ProductStatus? Status { get; set; }
        }

        public class ProductResponse
        {
            public string? Name { get; set; }
            public int? Edition { get; set; }
            public int? Update { get; set; }
            public ProductStatus? Status { get; set; }
            public int? UsageBand { get; set; }
            public DateOnly? IssueDate { get; set; }
            public List<ProductExport>? Exports { get; set; }
            public string? ErrorMessage { get; set; }
        }

        public class ProductHistoryResponse
        {
            public required string Name { get; set; }
            public int? Edition { get; set; }
            public int? Update { get; set; }
            public required ProductStatus Status { get; set; }
            public required DateTime From { get; set; }
            public required DateTime To { get; set; }
            public string? Owner { get; set; }
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

        public sealed record ProductExport(
            string Type,
            string Name,
            int Edition,
            int? Update,
            ProductStatus Status,
            DateTime Date,
            string? ErrorMessage = default);

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
