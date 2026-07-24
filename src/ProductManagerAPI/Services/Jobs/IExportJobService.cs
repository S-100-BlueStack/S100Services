using ProductManagerAPI.Jobs;
using ProductManagerAPI.Models;

namespace ProductManagerAPI.Services.Jobs
{
    public interface IExportJobService
    {
        ExportJobStartResponse Enqueue(ExportOperationJobRequest request);
    }

    public sealed class JobEnqueueException(string message, Exception? innerException = null)
        : Exception(message, innerException);
}
