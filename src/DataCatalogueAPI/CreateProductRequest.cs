using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V2;

/// <summary>
/// The payload used to create a product through version 2.0 of the API.
/// </summary>
public sealed class CreateProductRequest
{
    /// <summary>Gets the display name of the product.</summary>
    /// <example>Radar reflector</example>
    [Required]
    [StringLength(200, MinimumLength = 1)]
    public required string Name { get; init; }

    /// <summary>Gets the unit price of the product.</summary>
    /// <example>499.00</example>
    [Range(0.0, 1_000_000.0)]
    public required decimal Price { get; init; }

    /// <summary>Gets the ISO 4217 currency code of <see cref="Price"/>.</summary>
    /// <example>DKK</example>
    [Required]
    [RegularExpression("^[A-Z]{3}$", ErrorMessage = "Currency must be a three-letter ISO 4217 code.")]
    public required string Currency { get; init; }

    /// <summary>Gets the catalogue category the product belongs to.</summary>
    /// <example>Safety</example>
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public required string Category { get; init; }
}
