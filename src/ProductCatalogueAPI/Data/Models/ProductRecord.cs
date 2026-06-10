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
    }

    public enum ProductState : int
    {
        Idle = 1,       // Default. No changes detected.
        Exported = 2,   // Exported as new edition/update.
        Frozen = 5,     // Frozen and awaits manual action.
        InTransit = 6,  // Awaiting IC-ENC confirmation.
        Rejected = 7,    // Rejected by IC-ENC.



        //NewUpdate = 99,   // New update detected. Not yet exported.
        //NewEdition = 100, // New edition detected. Not yet exported.
        //Invalid = 101     // Invalid product. Requires manual action.
    }
}
