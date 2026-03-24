using S100FC.S128.FeatureTypes;
using static ProductCatalogueService.Services.SevenCs.SevenCsService;

namespace ProductCatalogueService.Services.SevenCs
{
    public interface ISevenCsService
    {
        Task<SummaryResponse> ValidateDatasetAsync(ElectronicProduct product, string outputPath);
    }
}
