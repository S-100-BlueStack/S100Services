using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;

namespace ProductCatalogueAPI.Services.Jobs
{
    public interface IExportJobService
    {
        ExportJobStartResponse Enqueue(ExportOperationJobRequest request);
    }

    public sealed class JobEnqueueException(string message, Exception? innerException = null)
        : Exception(message, innerException);
}
