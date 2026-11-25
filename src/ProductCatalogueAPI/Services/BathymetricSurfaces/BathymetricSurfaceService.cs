using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using S100FC.ProductCatalogue;
using static ProductCatalogueAPI.Contracts.ResponseTypes;

namespace ProductCatalogueAPI.Services.BathymetricSurfaces;

/// <summary>Resolves authoritative bathymetric datasets and projects their SQL-owned workflow state.</summary>
/// <param name="productManager">Provides the ArcGIS-backed S-128 catalogue.</param>
/// <param name="repository">Provides current bathymetric export and submission metadata.</param>
public sealed class BathymetricSurfaceService(IProductManager productManager, ProductExternalExportRepository repository)
{
    /// <summary>Existing IHO product metadata that identifies bathymetric rows in S-128 and SQL.</summary>
    internal const ProductSpecification Specification = ProductSpecification.S102;

    /// <summary>Loads bathymetric AOIs from the S-128 surface attribute bindings using the existing ArcGIS lane.</summary>
    /// <param name="token">Cancels the SQL projection and waiting for the ArcGIS result.</param>
    /// <returns>AOI geometries and current independent workflow status.</returns>
    public async Task<AOIResponse[]> GetAoisAsync(CancellationToken token) {
        var aois = await productManager.ElectronicProductManager.GetDatasetAOIs(Specification.ToString()).WaitAsync(token);
        if (aois.Count == 0)
            return [];
        var exports = (await repository.GetCurrentAsync(null, Specification, token)).ToDictionary(export => export.DatasetName, StringComparer.OrdinalIgnoreCase);
        return aois.Select(aoi => new AOIResponse {
            Geometry = aoi.Value,
            Attributes = new Attributes {
                DatasetName = aoi.Key,
                ProductSpecification = "S-102",
                BathymetricSurface = exports.GetValueOrDefault(aoi.Key.Trim())
                    ?? new ExternalProductExportResponse(aoi.Key, null, null, ExternalProductExportStatus.Idle, null, null, null, null)
            }
        }).ToArray();
    }

    /// <summary>Resolves the canonical name of a dataset currently classified as a bathymetric surface.</summary>
    /// <param name="name">Caller-supplied dataset name.</param>
    /// <returns>The authoritative canonical name, or null if the catalogue does not identify the dataset as bathymetric.</returns>
    internal ProductExternalExportRepository.ExternalProductReference? ResolveDataset(string name) {
        var product = productManager.ElectronicProductManager.ElectronicProduct(name, Specification.ToString());
        var datasetName = product?.datasetName?.Trim();
        return IsDatasetName(datasetName) ? new(datasetName!, product!.editionNumber ?? 0) : null;
    }

    /// <summary>Checks that a dataset name can be used in an API route and FTP directory.</summary>
    /// <param name="name">Name to check.</param>
    /// <returns>Whether the name meets the SQL size and permitted character constraints.</returns>
    internal static bool IsDatasetName(string? name) =>
        name is { Length: >= 1 and <= 64 } && DatasetStem(name) is { Length: > 0 } stem
        && stem.All(ch => char.IsAsciiLetterOrDigit(ch) || ch is '_' or '-');

    /// <summary>Normalizes a catalogue name to the HDF5 filename stem.</summary>
    /// <param name="name">Catalogue dataset name with or without the HDF5 extension.</param>
    /// <returns>The filename stem used for exchange-set validation.</returns>
    internal static string DatasetStem(string name) => name.EndsWith(".h5", StringComparison.OrdinalIgnoreCase) ? name[..^3] : name;
}
