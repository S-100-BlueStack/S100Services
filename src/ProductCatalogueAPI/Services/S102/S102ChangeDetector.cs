using ArcGIS.Core.Geometry;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Data.Models;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Services.BathymetricSurfaces;

/// <summary>Processes bathymetric source changes through a fixed UTC cutoff.</summary>
public interface IBathymetricSurfaceChangeDetector
{
    /// <summary>Processes source changes in the supplied UTC scan window.</summary>
    /// <param name="lastSuccessfulRunUtc">Cutoff saved by the previous successful scan. Use it as the exclusive lower bound for change timestamps. When null, there is no saved checkpoint and the source's initial baseline applies.</param>
    /// <param name="scanThroughUtc">UTC cutoff captured before this scan starts. Include changes at this timestamp and leave newer changes for the next scan.</param>
    /// <param name="cancellationToken">Cancels work for this scan.</param>
    /// <returns>A task that completes when the window has been processed.</returns>
    Task DetectAsync(DateTime? lastSuccessfulRunUtc, DateTime scanThroughUtc, CancellationToken cancellationToken);
}

/// <summary>Provides bathymetric source access and ProductCatalogue API access for a bounded scan.</summary>
/// <param name="dataManager">Read-only access to constraints and deconflicted surveys.</param>
/// <param name="productManager">Reads the stored S-128 bathymetric footprints.</param>
/// <param name="bathymetricSurfaceClient">Client for export reservations and completions.</param>
internal sealed class BathymetricSurfaceChangeDetector(IBathyDataManager dataManager, IProductManager productManager, BathymetricSurfaceClient bathymetricSurfaceClient) : IBathymetricSurfaceChangeDetector
{
    private readonly IBathyDataManager _dataManager = dataManager;
    private readonly BathymetricSurfaceClient _bathymetricSurfaceClient = bathymetricSurfaceClient;

    private readonly IElectronicProductManager _productManager = productManager.ElectronicProductManager;

    /// <inheritdoc/>
    /// <exception cref="NotImplementedException">The detector has no scan implementation.</exception>
    public async Task DetectAsync(DateTime? lastSuccessfulRunUtc, DateTime scanThroughUtc, CancellationToken cancellationToken) {

        // Get AOI
        var aois = await _productManager.GetDatasetAoiGeometriesAsync(ProductSpecification.S102.ToString(), cancellationToken);


        // Get FeatureServices as Geodatabase 
        await _dataManager.RunOnStaAsync(() => {
            using var constraintsGDB = _dataManager.OpenFeatureService(BathymetricSource.Constraints);
            using var deconflictedGDB = _dataManager.OpenFeatureService(BathymetricSource.DeconflictedSurveys);

            // Open feature classes and read rows here.
        }, cancellationToken);

        var exportId = Guid.NewGuid();
        string[] datasetNames = [];


        // Post results
        var request = new BathymetricChangeReport(exportId, datasetNames);
        var res = await _bathymetricSurfaceClient.ReserveAsync(request, cancellationToken);


        cancellationToken.ThrowIfCancellationRequested();
        throw new NotImplementedException("Bathymetric change detection is not implemented.");
    }
}
