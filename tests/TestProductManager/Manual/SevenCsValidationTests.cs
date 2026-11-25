using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Services.SevenCs;

namespace TestProductCatalogueAPI.Manual;

/// <summary>Runs the external validator against an explicitly selected local export.</summary>
public sealed class SevenCsValidationTests
{
    /// <summary>Submits the selected S-101 export to the configured SevenCs endpoint.</summary>
    /// <returns>A task that completes when the validator returns its report.</returns>
    [Fact(Skip = "Manual external validation. Enable only with a test endpoint and test export.")]
    [Trait("Category", "Manual")]
    public async Task ValidateLocalS101Export() {
        var datasetName = Environment.GetEnvironmentVariable("PRODUCTCATALOGUE_TEST_ENC_DATASET");
        var outputPath = Environment.GetEnvironmentVariable("PRODUCTCATALOGUE_TEST_ENC_OUTPUT");
        Assert.False(string.IsNullOrWhiteSpace(datasetName));
        Assert.True(Directory.Exists(outputPath));
        var service = new SevenCsService(NullLogger<SevenCsService>.Instance);

        var result = await service.ValidateDatasetAsync(datasetName!, 1, 0, outputPath!);

        Assert.NotNull(result);
    }
}
