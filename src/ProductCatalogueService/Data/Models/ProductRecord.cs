namespace ProductCatalogueService.Data.Models
{
    public class ProductRecord
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public ProductState State { get; set; }
        public string? Owner { get; set; }
        public DateTime Date_From { get; set; }
        public DateTime Date_to { get; set; }
    }

    public enum ProductState : int
    {
        Ready = 1,      // Default?
        NewEdition = 2,
        NewUpdate = 3,
        Invalid = 4,
        InTransit = 5,
        Frozen = 6,
    }
}
