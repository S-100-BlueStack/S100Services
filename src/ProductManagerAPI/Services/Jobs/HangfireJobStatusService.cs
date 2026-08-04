using Hangfire;
using Hangfire.Common;
using ProductManagerAPI.Jobs;
using ProductManagerAPI.Models;
using System.Globalization;

namespace ProductManagerAPI.Services.Jobs
{
    public sealed record HangfireStateSnapshot(string StateName, DateTime CreatedAtUtc);

    public sealed record HangfireJobSnapshot(
        IReadOnlyDictionary<string, string?> Parameters,
        IReadOnlyList<HangfireStateSnapshot> History
    );

    public interface IHangfireJobStorageAccessor
    {
        HangfireJobSnapshot? ReadJob(string jobId);
        IReadOnlyList<string> ReadActiveJobIds();
    }

    public sealed class HangfireJobStorageAccessor : IHangfireJobStorageAccessor
    {
        private const int PageSize = 100;

        private static readonly string[] ParameterNames = [
            ExportJobParameterNames.DatasetName,
            ExportJobParameterNames.OperationType,
            ExportJobParameterNames.ExportTarget,
            ExportJobParameterNames.ExpectedEdition,
            ExportJobParameterNames.ExpectedUpdate,
            ExportJobParameterNames.CorrelationId,
            ExportJobParameterNames.CreatedAtUtc,
            ExportJobParameterNames.ExecutionStarted,
            ExportJobParameterNames.Mode,
            ExportJobParameterNames.OperationOutcome,
            ExportJobParameterNames.DeliveryStatus,
            ExportJobParameterNames.ResultCode,
            ExportJobParameterNames.ResultMessage,
            ExportJobParameterNames.WarningCode,
            ExportJobParameterNames.WarningMessage,
            ExportJobParameterNames.ErrorCode,
            ExportJobParameterNames.ErrorMessage
        ];

        private readonly JobStorage _jobStorage;

        public HangfireJobStorageAccessor()
            : this(JobStorage.Current)
        {
        }

        public HangfireJobStorageAccessor(JobStorage jobStorage) {
            _jobStorage = jobStorage ?? throw new ArgumentNullException(nameof(jobStorage));
        }

        public HangfireJobSnapshot? ReadJob(string jobId) {
            if (string.IsNullOrWhiteSpace(jobId))
                return null;

            var details = _jobStorage.GetMonitoringApi().JobDetails(jobId);
            if (details == null)
                return null;

            using var connection = _jobStorage.GetConnection();
            var parameters = ParameterNames.ToDictionary(
                name => name,
                name => (string?)connection.GetJobParameter(jobId, name),
                StringComparer.Ordinal
            );
            var history = details.History
                .Select(state => new HangfireStateSnapshot(
                    state.StateName,
                    DateTime.SpecifyKind(state.CreatedAt, DateTimeKind.Utc)
                ))
                .ToArray();

            return new HangfireJobSnapshot(parameters, history);
        }

        public IReadOnlyList<string> ReadActiveJobIds() {
            var monitoring = _jobStorage.GetMonitoringApi();
            var jobIds = new HashSet<string>(StringComparer.Ordinal);

            foreach (var queue in monitoring.Queues()) {
                AddPagedJobIds(
                    jobIds,
                    monitoring.EnqueuedCount(queue.Name),
                    (from, count) => monitoring.EnqueuedJobs(queue.Name, from, count)
                );
                AddPagedJobIds(
                    jobIds,
                    monitoring.FetchedCount(queue.Name),
                    (from, count) => monitoring.FetchedJobs(queue.Name, from, count)
                );
            }

            AddPagedJobIds(
                jobIds,
                monitoring.ProcessingCount(),
                (from, count) => monitoring.ProcessingJobs(from, count)
            );
            AddPagedJobIds(
                jobIds,
                monitoring.ScheduledCount(),
                (from, count) => monitoring.ScheduledJobs(from, count)
            );

            return jobIds.ToArray();
        }

        private static void AddPagedJobIds<T>(
            HashSet<string> jobIds,
            long totalCount,
            Func<int, int, IEnumerable<KeyValuePair<string, T>>> readPage
        ) {
            var from = 0;

            while ((long)from < totalCount) {
                var remaining = totalCount - from;
                var count = (int)Math.Min(PageSize, remaining);
                var page = readPage(from, count).ToArray();

                if (page.Length == 0)
                    break;

                foreach (var job in page) {
                    if (!string.IsNullOrWhiteSpace(job.Key))
                        jobIds.Add(job.Key);
                }

                from += count;
            }
        }
    }

    public sealed class HangfireJobStatusService(
        IHangfireJobStorageAccessor storageAccessor,
        ILogger<HangfireJobStatusService> logger
    ) : IJobStatusService
    {
        private readonly IHangfireJobStorageAccessor _storageAccessor = storageAccessor;
        private readonly ILogger<HangfireJobStatusService> _logger = logger;

        public ExportJobStatusResponse? GetJob(string jobId) {
            try {
                var snapshot = _storageAccessor.ReadJob(jobId);
                return snapshot == null
                    ? null
                    : CreateResponse(jobId, snapshot);
            }
            catch (Exception ex) {
                _logger.LogWarning(
                    ex,
                    "Ignoring incomplete or malformed Product Manager job metadata for JobId {JobId}.",
                    jobId
                );
                return null;
            }
        }

        public IReadOnlyList<ExportJobStatusResponse> GetActiveJobs(string datasetName) {
            if (string.IsNullOrWhiteSpace(datasetName))
                return [];

            return _storageAccessor.ReadActiveJobIds()
                .Select(GetJob)
                .Where(response =>
                    response != null &&
                    string.Equals(
                        response.DatasetName,
                        datasetName.Trim(),
                        StringComparison.OrdinalIgnoreCase
                    ) &&
                    IsActivePublicStatus(response.Status)
                )
                .Select(response => response!)
                .OrderBy(response => response.CreatedAt)
                .ThenBy(response => response.JobId, StringComparer.Ordinal)
                .ToArray();
        }

        private static ExportJobStatusResponse? CreateResponse(
            string jobId,
            HangfireJobSnapshot snapshot
        ) {
            var datasetName = ReadRequired<string>(
                snapshot,
                ExportJobParameterNames.DatasetName
            );
            var operationType = ReadRequired<string>(
                snapshot,
                ExportJobParameterNames.OperationType
            );
            var correlationId = ReadRequired<string>(
                snapshot,
                ExportJobParameterNames.CorrelationId
            );
            var createdAtRaw = ReadRequired<string>(
                snapshot,
                ExportJobParameterNames.CreatedAtUtc
            );

            // These values are internal metadata, but they are required to
            // distinguish Product Manager jobs from incomplete/other jobs.
            var expectedEdition = ReadRequired<int?>(
                snapshot,
                ExportJobParameterNames.ExpectedEdition
            );
            var expectedUpdate = ReadRequired<int?>(
                snapshot,
                ExportJobParameterNames.ExpectedUpdate
            );
            if (!expectedEdition.HasValue || !expectedUpdate.HasValue)
                return null;

            if (!DateTimeOffset.TryParse(
                createdAtRaw,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var createdAt
            ))
                return null;

            if (string.IsNullOrWhiteSpace(datasetName) ||
                string.IsNullOrWhiteSpace(correlationId) ||
                operationType is not ("ExportEdition" or "Rollback" or "SendToIcEnc"))
                return null;

            var exportTarget = ReadOptional<string>(
                snapshot,
                ExportJobParameterNames.ExportTarget
            );
            if (operationType == "ExportEdition" &&
                !string.Equals(exportTarget, "S100", StringComparison.Ordinal))
                return null;
            if ((operationType == "Rollback" || operationType == SendToIcEncContract.OperationType) &&
                exportTarget != null)
                return null;

            var mode = ReadOptional<string>(snapshot, ExportJobParameterNames.Mode);
            var operationOutcome = ReadOptional<string>(snapshot, ExportJobParameterNames.OperationOutcome);
            var deliveryStatus = ReadOptional<string>(snapshot, ExportJobParameterNames.DeliveryStatus);
            if (operationType == SendToIcEncContract.OperationType &&
                (!string.Equals(mode, SendToIcEncContract.SimulationMode, StringComparison.Ordinal) ||
                 !string.Equals(deliveryStatus, SendToIcEncContract.NotDeliveredStatus, StringComparison.Ordinal)))
                return null;
            if (operationType != SendToIcEncContract.OperationType &&
                (mode != null || operationOutcome != null || deliveryStatus != null))
                return null;

            var currentState = snapshot.History
                .OrderByDescending(state => state.CreatedAtUtc)
                .FirstOrDefault();
            if (currentState == null)
                return null;

            var publicStatus = MapStatus(currentState.StateName);
            var startedAt = snapshot.History
                .Where(state => string.Equals(
                    state.StateName,
                    "Processing",
                    StringComparison.OrdinalIgnoreCase
                ))
                .OrderBy(state => state.CreatedAtUtc)
                .Select(state => (DateTimeOffset?)new DateTimeOffset(state.CreatedAtUtc))
                .FirstOrDefault();
            DateTimeOffset? completedAt = IsTerminalState(currentState.StateName)
                ? new DateTimeOffset(currentState.CreatedAtUtc)
                : null;

            var resultCode = ReadOptional<string>(snapshot, ExportJobParameterNames.ResultCode);
            var resultMessage = ReadOptional<string>(snapshot, ExportJobParameterNames.ResultMessage);
            var warningCode = ReadOptional<string>(snapshot, ExportJobParameterNames.WarningCode);
            var warningMessage = ReadOptional<string>(snapshot, ExportJobParameterNames.WarningMessage);
            var errorCode = ReadOptional<string>(snapshot, ExportJobParameterNames.ErrorCode);
            var errorMessage = ReadOptional<string>(snapshot, ExportJobParameterNames.ErrorMessage);

            ExportJobWarningResponse? warning = null;
            if (publicStatus == ExportJobContract.SucceededStatus &&
                operationType == "Rollback" &&
                !string.IsNullOrWhiteSpace(warningCode) &&
                !string.IsNullOrWhiteSpace(warningMessage)) {
                warning = new ExportJobWarningResponse {
                    Code = warningCode,
                    Message = warningMessage
                };
            }

            ExportJobErrorResponse? error = null;
            if (publicStatus == ExportJobContract.FailedStatus) {
                error = new ExportJobErrorResponse {
                    Code = string.IsNullOrWhiteSpace(errorCode)
                        ? ExportJobContract.JobFailedCode
                        : errorCode,
                    Message = string.IsNullOrWhiteSpace(errorMessage)
                        ? ExportJobContract.JobFailedMessage
                        : errorMessage
                };
            }

            if (operationType == SendToIcEncContract.OperationType &&
                publicStatus == ExportJobContract.SucceededStatus &&
                (!string.Equals(operationOutcome, SendToIcEncContract.SimulationCompletedOutcome, StringComparison.Ordinal) ||
                 !string.Equals(resultCode, SendToIcEncContract.CompletedCode, StringComparison.Ordinal) ||
                 !string.Equals(resultMessage, SendToIcEncContract.CompletedMessage, StringComparison.Ordinal)))
                return null;

            var message = error?.Message;
            if (publicStatus == ExportJobContract.SucceededStatus)
                message = resultMessage;

            var publicOperationOutcome = publicStatus == ExportJobContract.SucceededStatus
                ? operationOutcome
                : null;

            return new ExportJobStatusResponse {
                JobId = jobId,
                DatasetName = datasetName,
                OperationType = operationType,
                ExportTarget = exportTarget,
                Status = publicStatus,
                CreatedAt = createdAt,
                StartedAt = startedAt,
                CompletedAt = completedAt,
                Message = message,
                Mode = mode,
                OperationOutcome = publicOperationOutcome,
                DeliveryStatus = deliveryStatus,
                CorrelationId = correlationId,
                Warning = warning,
                Error = error
            };
        }

        private static bool IsActivePublicStatus(string status) =>
            string.Equals(status, ExportJobContract.QueuedStatus, StringComparison.Ordinal) ||
            string.Equals(status, ExportJobContract.RunningStatus, StringComparison.Ordinal);

        private static string MapStatus(string stateName) {
            if (string.Equals(stateName, "Processing", StringComparison.OrdinalIgnoreCase))
                return ExportJobContract.RunningStatus;
            if (string.Equals(stateName, "Succeeded", StringComparison.OrdinalIgnoreCase))
                return ExportJobContract.SucceededStatus;
            if (string.Equals(stateName, "Failed", StringComparison.OrdinalIgnoreCase))
                return ExportJobContract.FailedStatus;
            if (string.Equals(stateName, "Deleted", StringComparison.OrdinalIgnoreCase))
                return ExportJobContract.CancelledStatus;

            return ExportJobContract.QueuedStatus;
        }

        private static bool IsTerminalState(string stateName) =>
            string.Equals(stateName, "Succeeded", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(stateName, "Failed", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(stateName, "Deleted", StringComparison.OrdinalIgnoreCase);

        private static T ReadRequired<T>(
            HangfireJobSnapshot snapshot,
            string parameterName
        ) {
            if (!snapshot.Parameters.TryGetValue(parameterName, out var raw) || raw == null)
                throw new InvalidOperationException($"Missing job parameter: {parameterName}");

            return JobHelper.FromJson<T>(raw);
        }

        private static T? ReadOptional<T>(
            HangfireJobSnapshot snapshot,
            string parameterName
        ) {
            if (!snapshot.Parameters.TryGetValue(parameterName, out var raw) || raw == null)
                return default;

            return JobHelper.FromJson<T>(raw);
        }
    }
}
