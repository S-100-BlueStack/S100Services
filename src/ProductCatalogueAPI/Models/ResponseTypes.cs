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

        public class ProductResponse
        {
            // public Guid Uuid { get; set; }
            public string? Name { get; set; }
            public int? Edition { get; set; }
            public int? Update { get; set; }
            public int? Status { get; set; }     // Enumeration
            public int? UsageBand { get; set; }  // Enumeration
            public string? Aoi { get; set; }
            public DateOnly? IssueDate { get; set; }
        }

        public enum ProductStatus : int
        {
            Ready = 1,
            NewEdition = 2,
            NewUpdate = 3,
            Invalid = 4,
            InTransit = 5
        }
    }
}
