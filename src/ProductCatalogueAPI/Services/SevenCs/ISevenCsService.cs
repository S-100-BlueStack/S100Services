using static ProductCatalogueAPI.Services.SevenCs.SevenCsService;

namespace ProductCatalogueAPI.Services.SevenCs
{
    public interface ISevenCsService
    {
        /// <summary>Validates one generated S-101 candidate without reading its version from S-128.</summary>
        Task<SummaryResponse> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default);
    }
}
