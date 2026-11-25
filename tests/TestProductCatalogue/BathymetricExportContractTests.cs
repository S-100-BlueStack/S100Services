using System.Text.Json;
using ProductCatalogueAPI.Contracts;

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
}
