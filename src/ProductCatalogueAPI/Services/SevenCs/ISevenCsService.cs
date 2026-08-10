using S100FC.S128.FeatureTypes;
using static ProductCatalogueAPI.Services.SevenCs.SevenCsService;

namespace ProductCatalogueAPI.Services.SevenCs
{
    public interface ISevenCsService
    {
        Task<SummaryResponse> ValidateDatasetAsync(ElectronicProduct product, string outputPath);
    }
}
