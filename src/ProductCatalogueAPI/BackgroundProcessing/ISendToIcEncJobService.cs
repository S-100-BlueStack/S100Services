using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Jobs;

namespace ProductCatalogueAPI.BackgroundProcessing
{
    public interface ISendToIcEncJobService
    {
        ExportJobStartResponse Enqueue(SendToIcEncJobRequest request);
    }
}
