namespace DataCatalague.Api.Models.V2;

/// <summary>
/// A product as returned by version 2.0 of the API. Compared with version 1.0 this
/// contract adds an explicit currency, a category and an audit timestamp.
/// </summary>
public sealed class ProductResponse
{
    /// <summary>Gets the unique identifier of the product.</summary>
    /// <example>1</example>
    public required int Id { get; init; }

    /// <summary>Gets the display name of the product.</summary>
    /// <example>Marine chart plotter</example>
    public required string Name { get; init; }

    /// <summary>Gets the unit price of the product.</summary>
    /// <example>1299.00</example>
    public required decimal Price { get; init; }

    /// <summary>Gets the ISO 4217 currency code of <see cref="Price"/>.</summary>
    /// <example>DKK</example>
    public required string Currency { get; init; }

    /// <summary>Gets the catalogue category the product belongs to.</summary>
    /// <example>Navigation</example>
    public required string Category { get; init; }

    /// <summary>Gets the UTC timestamp of the last change to the product.</summary>
    /// <example>2026-01-15T09:30:00+00:00</example>
    public required DateTimeOffset LastUpdatedUtc { get; init; }
}
