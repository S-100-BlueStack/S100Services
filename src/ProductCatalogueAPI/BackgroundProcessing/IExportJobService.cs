using ProductCatalogueAPI.BackgroundProcessing.Execution;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Jobs;

namespace ProductCatalogueAPI.BackgroundProcessing
{
    public interface IExportJobService
    {
        ExportJobStartResponse Enqueue(ExportOperationJobRequest request);
    }

    public sealed class JobEnqueueException(string message, Exception? innerException = null)
        : Exception(message, innerException);
}
