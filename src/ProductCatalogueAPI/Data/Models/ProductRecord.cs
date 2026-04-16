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
        Ready = 1,      // Default. No changes detected.
        NewEdition = 2, // Pending with a new edition.
        NewUpdate = 3,  // Pending with a new update.
        Invalid = 4,    // Pending with invalid changes detected during validation of exchangeset.
        Frozen = 5,     // Manually frozen and ineligble for automatic upload to IC-ENC.
        InTransit = 6,  // Awaiting IC-ENC confirmation.
        Rejected = 7    // Rejected by IC-ENC.
    }
}
