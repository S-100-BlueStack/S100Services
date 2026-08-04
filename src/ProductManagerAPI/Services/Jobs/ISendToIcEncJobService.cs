using ProductManagerAPI.Jobs;
using ProductManagerAPI.Models;

namespace ProductManagerAPI.Services.Jobs
{
    public interface ISendToIcEncJobService
    {
        ExportJobStartResponse Enqueue(SendToIcEncJobRequest request);
    }
}
