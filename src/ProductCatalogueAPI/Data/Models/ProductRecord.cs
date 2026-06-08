namespace ProductCatalogueAPI.Data.Models
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
        Idle = 1,       // Default. No changes detected.
        Exported = 2,   // Exported as new edition/update.
        Frozen = 5,     // Frozen and awaits manual action.
        InTransit = 6,  // Awaiting IC-ENC confirmation.
        Rejected = 7,    // Rejected by IC-ENC.
        Invalid = 8,    // Invalid product record. TODO: REMOVE THIS. TEMPORARY.
        NewUpdate = 9,   // New update record. TODO: REMOVE THIS. TEMPORARY.
    }
}
