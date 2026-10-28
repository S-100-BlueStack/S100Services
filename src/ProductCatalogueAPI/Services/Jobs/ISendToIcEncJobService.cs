using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;

namespace ProductCatalogueAPI.Services.Jobs
{
    public interface ISendToIcEncJobService
    {
        ExportJobStartResponse Enqueue(SendToIcEncJobRequest request);
    }
}
