using S100FC.S128.FeatureTypes;
using static ProductManagerAPI.Services.SevenCs.SevenCsService;

namespace ProductManagerAPI.Services.SevenCs
{
    public interface ISevenCsService
    {
        Task<SummaryResponse> ValidateDatasetAsync(ElectronicProduct product, string outputPath);
    }
}
