using Hangfire;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;

namespace ProductCatalogueAPI.Services.Jobs
{
    public sealed class HangfireSendToIcEncJobService(
        IBackgroundJobClient backgroundJobClient,
        ILogger<HangfireSendToIcEncJobService> logger
    ) : ISendToIcEncJobService
    {
        private readonly IBackgroundJobClient _backgroundJobClient = backgroundJobClient;
        private readonly ILogger<HangfireSendToIcEncJobService> _logger = logger;

        public ExportJobStartResponse Enqueue(SendToIcEncJobRequest request) {
            ArgumentNullException.ThrowIfNull(request);

            try {
                var jobId = _backgroundJobClient.Enqueue<UploadSingularProductJob>(job =>
                    job.RunAsync(request, null!, CancellationToken.None)
                );

                if (string.IsNullOrWhiteSpace(jobId))
                    throw new JobEnqueueException("Hangfire did not return a job identifier.");

                var statusUrl = $"/jobs/{Uri.EscapeDataString(jobId)}";
                _logger.LogInformation(
                    "IC-ENC send simulation job enqueued. JobId: {JobId}. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}",
                    jobId,
                    request.DatasetName,
                    request.CorrelationId
                );

                return new ExportJobStartResponse {
                    JobId = jobId,
                    DatasetName = request.DatasetName,
                    OperationType = SendToIcEncContract.OperationType,
                    ExportTarget = null,
                    Status = ExportJobContract.QueuedStatus,
                    CreatedAt = request.CreatedAtUtc.ToUniversalTime(),
                    CorrelationId = request.CorrelationId,
                    StatusUrl = statusUrl,
                    Mode = SendToIcEncContract.SimulationMode,
                    DeliveryStatus = SendToIcEncContract.NotDeliveredStatus,
                    Message = SendToIcEncContract.AcceptedMessage
                };
            }
            catch (JobEnqueueException) {
                throw;
            }
            catch (Exception ex) {
                throw new JobEnqueueException(
                    "The IC-ENC send simulation could not be queued.",
                    ex
                );
            }
        }
    }
}
