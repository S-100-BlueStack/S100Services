using ProductCatalogueAPI.Contracts;

namespace ProductCatalogueAPI.BackgroundProcessing
{
    public interface IJobStatusService
    {
        ExportJobStatusResponse? GetJob(string jobId);
        IReadOnlyList<ExportJobStatusResponse> GetActiveJobs(string datasetName);
    }
}
