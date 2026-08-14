namespace ProductCatalogueAPI.Data.Models
{
    public class ProductRecord
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public ProductState State { get; set; }
        public string ProductSpecification { get; set; } = "S-128";
        public string? Owner { get; set; }
        public int EditionNo { get; set; }
        public int UpdateNo { get; set; } = 0;
        public DateTime Date_From { get; set; }
        public DateTime Date_to { get; set; }
        public string? ErrorCode { get; set; }
        public string? ErrorMessage { get; set; }
    }

    public enum ProductState : int
    {
        Idle = 1,
        Exported = 2,
        Frozen = 5,
        InTransit = 6,
        Rejected = 7,
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
