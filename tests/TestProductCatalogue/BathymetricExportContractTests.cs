using System.Reflection;
using System.Text.Json;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Services.BathymetricSurfaces;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;

namespace TestProductCatalogueAPI;

/// <summary>Verifies the JSON contract used by external bathymetric producers and clients.</summary>
public sealed class BathymetricExportContractTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { PropertyNamingPolicy = null };

    /// <summary>Ensures an active export is identified by its export ID and the shared Exporting state name.</summary>
    [Fact]
    public void SerializesTheExportingStatusAndExportId() {
        var exportId = Guid.Parse("b53baa7d-25ae-4448-9d67-7f5a2f9fff1b");
        var response = new ExternalProductExportResponse("102DK00TEST", exportId, 3, ExternalProductExportStatus.Exporting, null, null, null, null);

        var json = JsonSerializer.SerializeToElement(response, JsonOptions);

        Assert.Equal(exportId, json.GetProperty("ExportId").GetGuid());
        Assert.Equal("Exporting", json.GetProperty("Status").GetString());
    }

    /// <summary>Reservations use the catalogue's spelling and published edition for the bathymetric specification.</summary>
    /// <param name="catalogueName">Stored name before trimming and route validation.</param>
    /// <param name="edition">Published edition stored in S-128.</param>
    /// <param name="expectedName">Canonical name, or null when the catalogue name is unusable.</param>
    /// <param name="expectedEdition">Edition used to initialize the export track.</param>
    [Theory]
    [InlineData("  102DK00Test.H5 ", 3, "102DK00Test.H5", 3)]
    [InlineData("102DK00Test", null, "102DK00Test", 0)]
    [InlineData("invalid/name", 3, null, 0)]
    [InlineData(null, null, null, 0)]
    public void ResolvesOnlyUsableCanonicalBathymetricDatasets(string? catalogueName, int? edition, string? expectedName, int expectedEdition) {
        var products = DispatchProxy.Create<IElectronicProductManager, BathymetricProductLookup>();
        ((BathymetricProductLookup)(object)products).Product = new ElectronicProduct { datasetName = catalogueName, editionNumber = edition };
        var catalogue = new BathymetricSurfaceService(new TestProductManager(products), null!);

        var resolved = catalogue.ResolveDataset("102dk00test");

        Assert.Equal(expectedName, resolved?.DatasetName);
        Assert.Equal(expectedName is null ? (int?)null : expectedEdition, resolved?.PublishedEdition);
    }

    /// <summary>Ensures a producer can report the same caller-assigned export ID on retry.</summary>
    [Fact]
    public void ReadsTheProducersExportId() {
        const string json = """
            {"exportId":"b53baa7d-25ae-4448-9d67-7f5a2f9fff1b","datasetNames":["102DK00TEST"]}
            """;

        var report = JsonSerializer.Deserialize<BathymetricChangeReport>(json, JsonOptions);

        Assert.NotNull(report);
        Assert.Equal(Guid.Parse("b53baa7d-25ae-4448-9d67-7f5a2f9fff1b"), report.ExportId);
        Assert.Equal("102DK00TEST", Assert.Single(report.DatasetNames));
    }

    /// <summary>Provides the catalogue without initializing ArcGIS.</summary>
    /// <param name="products">The test's electronic product lookup.</param>
    private sealed class TestProductManager(IElectronicProductManager products) : IProductManager
    {
        /// <inheritdoc/>
        public INauticalProductManager NauticalProductManager => throw new NotSupportedException();

        /// <inheritdoc/>
        public IElectronicProductManager ElectronicProductManager => products;
    }

    /// <summary>Verifies that the lookup uses the exact bathymetric specification.</summary>
    public class BathymetricProductLookup : DispatchProxy
    {
        /// <summary>Product returned for the requested dataset and specification.</summary>
        public ElectronicProduct? Product { get; set; }

        /// <inheritdoc/>
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) {
            Assert.Equal(nameof(IElectronicProductManager.ElectronicProduct), targetMethod?.Name);
            Assert.Equal(new object?[] { "102dk00test", "S102" }, args);
            return Product;
        }
    }
}
