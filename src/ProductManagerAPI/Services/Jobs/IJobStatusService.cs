using ProductManagerAPI.Models;

namespace ProductManagerAPI.Services.Jobs
{
    public interface IJobStatusService
    {
        ExportJobStatusResponse? GetJob(string jobId);
        IReadOnlyList<ExportJobStatusResponse> GetActiveJobs(string datasetName);
    }
}
