using ProductCatalogueAPI.Data.Models;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Identifies the product track selected from the S-128 catalogue.
/// </summary>
public sealed record ExportProductIdentity(string DatasetName, ProductSpecification ProductSpecification);

/// <summary>
/// Resolves export products from catalogue data rather than from dataset-name conventions.
/// </summary>
public static class ExportProductResolver
{
    /// <summary>
    /// Resolves the product whose dataset name was supplied by the caller.
    /// </summary>
    /// <param name="productManager">The S-128-backed electronic product manager.</param>
    /// <param name="datasetName">The dataset name used to locate the catalogue row.</param>
    /// <returns>The canonical dataset name and product specification, or <see langword="null"/> when no row exists.</returns>
    /// <exception cref="ArgumentNullException">Thrown when <paramref name="productManager"/> is <see langword="null"/>.</exception>
    /// <exception cref="ProductMappingIntegrityException">Thrown when the catalogue row has no usable identity or uses an unsupported specification value.</exception>
    public static ExportProductIdentity? Resolve(IElectronicProductManager productManager, string datasetName)
    {
        ArgumentNullException.ThrowIfNull(productManager);

        var product = productManager.ResolveExportProduct(datasetName);
        if (product is null)
            return null;

        if (string.IsNullOrWhiteSpace(product.datasetName))
            throw new ProductMappingIntegrityException($"The S-128 ElectronicProduct for '{datasetName}' has no datasetName.");

        return new(product.datasetName.Trim(), ParseProductSpecification(product.productSpecification?.name, datasetName));
    }

    /// <summary>
    /// Converts the product-specification value stored in an S-128 feature binding into the API enum.
    /// </summary>
    /// <param name="value">The stored specification value, with or without the S-100 hyphen.</param>
    /// <param name="datasetName">The dataset used to provide diagnostic context.</param>
    /// <returns>The supported API product specification.</returns>
    /// <exception cref="ProductMappingIntegrityException">Thrown when the value is missing or is not a supported product specification.</exception>
    public static ProductSpecification ParseProductSpecification(string? value, string datasetName)
    {
        var normalized = value?.Replace("-", string.Empty, StringComparison.Ordinal).Trim().ToUpperInvariant();
        return normalized switch
        {
            "S57" => ProductSpecification.S57,
            "S101" or "S128" => ProductSpecification.S101,
            _ => throw new ProductMappingIntegrityException($"The S-128 ElectronicProduct '{datasetName}' has unsupported product specification '{value ?? "<missing>"}'.")
        };
    }
}
