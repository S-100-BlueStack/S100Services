using Hangfire;
using ProductManagerAPI.Jobs;
using ProductManagerAPI.Models;
using ProductManagerAPI.Services.Operations;

namespace ProductManagerAPI.Services.Jobs
{
    public sealed class HangfireExportJobService(
        IBackgroundJobClient backgroundJobClient,
        ILogger<HangfireExportJobService> logger
    ) : IExportJobService
    {
        private readonly IBackgroundJobClient _backgroundJobClient = backgroundJobClient;
        private readonly ILogger<HangfireExportJobService> _logger = logger;

        public ExportJobStartResponse Enqueue(ExportOperationJobRequest request) {
            try {
                var jobId = _backgroundJobClient.Enqueue<ExportOperationJob>(job =>
                    job.RunAsync(request, null!, CancellationToken.None)
                );

                if (string.IsNullOrWhiteSpace(jobId))
                    throw new JobEnqueueException("Hangfire did not return a job identifier.");

                var statusUrl = $"/jobs/{Uri.EscapeDataString(jobId)}";
                _logger.LogInformation(
                    "Product Manager job enqueued. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}",
                    jobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId
                );

                return new ExportJobStartResponse {
                    JobId = jobId,
                    DatasetName = request.DatasetName,
                    OperationType = ExportOperationContract.ToPublicValue(request.OperationType),
                    ExportTarget = request.ExportTarget,
                    Status = ExportJobContract.QueuedStatus,
                    CreatedAt = request.CreatedAtUtc.ToUniversalTime(),
                    CorrelationId = request.CorrelationId,
                    StatusUrl = statusUrl
                };
            }
            catch (JobEnqueueException) {
                throw;
            }
            catch (Exception ex) {
                throw new JobEnqueueException("The Product Manager job could not be created.", ex);
            }
        }
    }
}
