using ProductCatalogueAPI.Models;

namespace ProductCatalogueAPI.Services.Jobs
{
    public interface IJobStatusService
    {
        ExportJobStatusResponse? GetJob(string jobId);
        IReadOnlyList<ExportJobStatusResponse> GetActiveJobs(string datasetName);
    }
}
