using Hangfire;
using Hangfire.Server;
using ProductManagerAPI.Services.Locking;
using ProductManagerAPI.Services.Operations;
using S100FC.ProductCatalogue;

namespace ProductManagerAPI.Jobs
{
    public interface IExportJobExecutionContext
    {
        string JobId { get; }
        T? GetJobParameter<T>(string name);
        void SetJobParameter(string name, object? value);
    }

    public sealed class ExportOperationJob(
        IProductManager productManager,
        IDatasetLockService datasetLockService,
        IExportOperationService exportOperationService,
        ILogger<ExportOperationJob> logger
    )
    {
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IDatasetLockService _datasetLockService = datasetLockService;
        private readonly IExportOperationService _exportOperationService = exportOperationService;
        private readonly ILogger<ExportOperationJob> _logger = logger;

        [AutomaticRetry(Attempts = 0)]
        public Task RunAsync(
            ExportOperationJobRequest request,
            PerformContext performContext,
            CancellationToken cancellationToken
        ) {
            ArgumentNullException.ThrowIfNull(performContext);
            return ExecuteAsync(
                request,
                new HangfireExportJobExecutionContext(performContext),
                cancellationToken
            );
        }

        public async Task ExecuteAsync(
            ExportOperationJobRequest request,
            IExportJobExecutionContext context,
            CancellationToken cancellationToken
        ) {
            ArgumentNullException.ThrowIfNull(request);
            ArgumentNullException.ThrowIfNull(context);

            _logger.LogInformation(
                "Product Manager job starting. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}. ExpectedEdition: {ExpectedEdition}. ExpectedUpdate: {ExpectedUpdate}",
                context.JobId,
                request.DatasetName,
                request.OperationType,
                request.CorrelationId,
                request.ExpectedEdition,
                request.ExpectedUpdate
            );

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(
                request.DatasetName,
                cancellationToken
            );

            if (datasetLock == null) {
                _logger.LogWarning(
                    "Product Manager job could not acquire dataset lock. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}",
                    context.JobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId
                );
                throw CreateSafeFailure(
                    context,
                    ExportJobContract.DatasetBusyCode,
                    ExportJobContract.DatasetBusyMessage
                );
            }

            var executionStarted = context.GetJobParameter<bool?>(
                ExportJobParameterNames.ExecutionStarted
            ) == true;

            if (executionStarted) {
                _logger.LogError(
                    "Product Manager job execution guard was already set. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}",
                    context.JobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId
                );
                throw CreateSafeFailure(
                    context,
                    ExportJobContract.ManualReviewRequiredCode,
                    ExportJobContract.ManualReviewRequiredMessage
                );
            }

            ElectronicProductVersion? currentVersion;
            try {
                currentVersion = await _electronicProductManager.ReadElectronicProductVersionAsync(
                    request.DatasetName,
                    cancellationToken
                );
            }
            catch (ProductDataIntegrityException ex) {
                _logger.LogError(
                    ex,
                    "Ambiguous authoritative Product data found during job execution. JobId: {JobId}. DatasetName: {DatasetName}. ExactMatchCount: {ExactMatchCount}. CorrelationId: {CorrelationId}",
                    context.JobId,
                    request.DatasetName,
                    ex.ExactMatchCount,
                    request.CorrelationId
                );
                throw CreateSafeFailure(
                    context,
                    ExportJobContract.ProductDataIntegrityErrorCode,
                    ExportJobContract.ProductDataIntegrityJobMessage
                );
            }

            if (currentVersion == null) {
                _logger.LogWarning(
                    "Authoritative Product was not found during job execution. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}",
                    context.JobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId
                );
                throw CreateSafeFailure(
                    context,
                    ExportJobContract.ProductNotFoundCode,
                    ExportJobContract.ProductNoLongerAvailableMessage
                );
            }

            if (currentVersion.Edition != request.ExpectedEdition ||
                currentVersion.Update != request.ExpectedUpdate) {
                _logger.LogWarning(
                    "Authoritative Product version changed before job execution. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}. ExpectedEdition: {ExpectedEdition}. ExpectedUpdate: {ExpectedUpdate}. CurrentEdition: {CurrentEdition}. CurrentUpdate: {CurrentUpdate}",
                    context.JobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId,
                    request.ExpectedEdition,
                    request.ExpectedUpdate,
                    currentVersion.Edition,
                    currentVersion.Update
                );
                throw CreateSafeFailure(
                    context,
                    ExportJobContract.ProductVersionChangedCode,
                    ExportJobContract.ProductVersionChangedMessage
                );
            }

            try {
                cancellationToken.ThrowIfCancellationRequested();
                Action markExecutionStarted = () =>
                    context.SetJobParameter(ExportJobParameterNames.ExecutionStarted, true);

                var result = request.OperationType switch {
                    ExportOperationType.ExportEdition => await _exportOperationService.ExecuteNewEditionAsync(
                        request.DatasetName,
                        ParseExportTarget(request.ExportTarget),
                        user: null,
                        cancellationToken,
                        markExecutionStarted
                    ),
                    ExportOperationType.Rollback => await _exportOperationService.ExecuteRollbackAsync(
                        request.DatasetName,
                        cancellationToken,
                        markExecutionStarted
                    ),
                    _ => throw new ArgumentOutOfRangeException(
                        nameof(request.OperationType),
                        request.OperationType,
                        null
                    )
                };

                context.SetJobParameter(ExportJobParameterNames.ResultCode, result.Code);
                context.SetJobParameter(ExportJobParameterNames.ResultMessage, result.Message);

                if (result.Warning != null) {
                    context.SetJobParameter(
                        ExportJobParameterNames.WarningCode,
                        result.Warning.Code
                    );
                    context.SetJobParameter(
                        ExportJobParameterNames.WarningMessage,
                        result.Warning.Message
                    );
                }

                _logger.LogInformation(
                    "Product Manager job completed. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}. ResultCode: {ResultCode}. WarningCode: {WarningCode}",
                    context.JobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId,
                    result.Code,
                    result.Warning?.Code
                );
            }
            catch (ExportOperationRejectedException ex) {
                context.SetJobParameter(
                    ExportJobParameterNames.ErrorCode,
                    ExportJobContract.ProductOperationRejectedCode
                );
                context.SetJobParameter(
                    ExportJobParameterNames.ErrorMessage,
                    ex.Message
                );

                _logger.LogWarning(
                    "Product Manager job was rejected by an operation precondition. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}. Reason: {Reason}",
                    context.JobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId,
                    ex.Message
                );

                throw new ExportOperationJobException(
                    ExportJobContract.ProductOperationRejectedCode,
                    ex.Message
                );
            }
            catch (Exception ex) {
                var (code, message) = request.OperationType switch {
                    ExportOperationType.ExportEdition => (
                        ExportJobContract.ExportFailedCode,
                        ExportJobContract.ExportFailedMessage
                    ),
                    ExportOperationType.Rollback => (
                        ExportJobContract.RollbackFailedCode,
                        ExportJobContract.RollbackFailedMessage
                    ),
                    _ => (
                        ExportJobContract.JobFailedCode,
                        ExportJobContract.JobFailedMessage
                    )
                };

                context.SetJobParameter(ExportJobParameterNames.ErrorCode, code);
                context.SetJobParameter(ExportJobParameterNames.ErrorMessage, message);

                _logger.LogError(
                    ex,
                    "Product Manager job failed. JobId: {JobId}. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}",
                    context.JobId,
                    request.DatasetName,
                    request.OperationType,
                    request.CorrelationId
                );
                throw;
            }
        }

        private static Models.RequestTypes.ExportFormat ParseExportTarget(string? exportTarget) {
            if (string.Equals(exportTarget, "S100", StringComparison.OrdinalIgnoreCase))
                return Models.RequestTypes.ExportFormat.S100;

            throw new InvalidOperationException("The queued export target is invalid.");
        }

        private static ExportOperationJobException CreateSafeFailure(
            IExportJobExecutionContext context,
            string code,
            string message
        ) {
            context.SetJobParameter(ExportJobParameterNames.ErrorCode, code);
            context.SetJobParameter(ExportJobParameterNames.ErrorMessage, message);
            return new ExportOperationJobException(code, message);
        }

        private sealed class HangfireExportJobExecutionContext(PerformContext context)
            : IExportJobExecutionContext
        {
            private readonly PerformContext _context = context;

            public string JobId => _context.BackgroundJob.Id;

            public T? GetJobParameter<T>(string name) =>
                _context.GetJobParameter<T>(name);

            public void SetJobParameter(string name, object? value) =>
                _context.SetJobParameter(name, value!);
        }
    }

    public sealed class ExportOperationJobException(string code, string message)
        : Exception($"{code}: {message}")
    {
        public string Code { get; } = code;
    }
}
