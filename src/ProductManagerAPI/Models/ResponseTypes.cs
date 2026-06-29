namespace ProductManagerAPI.Models
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
            public required Attributes Attributes { get; set; }
        }

        public class Attributes
        {
            public string? DatasetName { get; set; }
            public int? DisplayScale { get; set; }
            public int? UsageBand { get; set; }
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
            public string? Owner { get; set;  }
        }



        public sealed record ProductExport(string Type, string Name, int Edition, int? Update, ProductStatus Status, DateTime Date, string? ErrorMessage = default);


        public enum ProductStatus : int
        {
            Idle = 1,       // Default. No changes detected.
            Exported = 2,   // Exported as new edition/update.
            Frozen = 5,     // Frozen and awaits manual action.
            InTransit = 6,  // Awaiting IC-ENC confirmation.
            Rejected = 7    // Rejected by IC-ENC.
        }
    }
}