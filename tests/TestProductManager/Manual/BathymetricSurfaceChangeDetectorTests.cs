using ArcGIS.Core.Data;
using ArcGisHost = ArcGIS.Core.Hosting.Host;
using ProductCatalogueAPI.Services.BathymetricSurfaces;
using ProductCatalogueAPI.Startup;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI.Manual;

/// <summary>Exercises the bathymetric detector and its ArcGIS inputs without starting the API or Hangfire.</summary>
/// <remarks>Use a test S-128 catalogue with bathymetric footprints and read-only credentials for the two feature services.</remarks>
public sealed class BathymetricSurfaceChangeDetectorTests
{
    /// <summary>Verifies the S-128 catalogue contains bathymetric polygons and both feature services can be read.</summary>
    /// <returns>A task that completes when all three inputs are available.</returns>
    [Fact]
    public async Task ReadBathymetricInputs() {
        if (!System.Diagnostics.Debugger.IsAttached)
            return;

        using var dataManager = new BathyDataManager();

        var aois = await dataManager.ReadBathymetricAoisAsync(CancellationToken.None);

        await dataManager.RunOnStaAsync(() => {
            using var constraints = dataManager.OpenFeatureService(BathymetricSource.Constraints);
            using var deconflicted = dataManager.OpenFeatureService(BathymetricSource.DeconflictedSurveys);

            // Look for featureclasses
            System.Diagnostics.Debugger.Break();
        }, CancellationToken.None);
    }

    /// <summary>Calls the real detector directly with a one-hour UTC scan window and an offline ProductCatalogue client.</summary>
    /// <returns>A task that completes when the detector completes its scan.</returns>
    [Fact]
    public async Task RunDetectorDirectly() {
        if (!System.Diagnostics.Debugger.IsAttached)
            return;

        using var dataManager = new BathyDataManager();
        using var http = new HttpClient(new OfflineApiHandler()) { BaseAddress = new Uri("https://productcatalogue.invalid/") };
        var detector = new BathymetricSurfaceChangeDetector(dataManager, new BathymetricSurfaceClient(http));

        var scanThroughUtc = DateTime.UtcNow;
        await detector.DetectAsync(scanThroughUtc.AddHours(-1), scanThroughUtc, CancellationToken.None);
    }


    /// <summary>Stops the manual run at the first ProductCatalogue API call.</summary>
    private sealed class OfflineApiHandler : HttpMessageHandler
    {
        /// <inheritdoc/>
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("The manual bathymetric detector test blocks ProductCatalogue API calls.");
    }
}


