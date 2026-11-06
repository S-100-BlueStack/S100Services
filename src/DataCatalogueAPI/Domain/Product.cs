namespace DataCatalague.Api.Domain;

/// <summary>
/// A product held by the catalogue. This is the internal representation; each API
/// version projects it onto its own response contract.
/// </summary>
public sealed class Product
{
    /// <summary>Gets or sets the unique identifier of the product.</summary>
    public required int Id { get; set; }

    /// <summary>Gets or sets the display name of the product.</summary>
    public required string Name { get; set; }

    /// <summary>Gets or sets the unit price of the product.</summary>
    public required decimal Price { get; set; }

    /// <summary>Gets or sets the ISO 4217 currency code of <see cref="Price"/>.</summary>
    public required string Currency { get; set; }

    /// <summary>Gets or sets the catalogue category the product belongs to.</summary>
    public required string Category { get; set; }

    /// <summary>Gets or sets the UTC timestamp of the last change to the product.</summary>
    public required DateTimeOffset LastUpdatedUtc { get; set; }
}
