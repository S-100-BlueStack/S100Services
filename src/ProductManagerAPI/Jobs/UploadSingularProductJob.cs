using Hangfire;
using Hangfire.Server;
using Microsoft.Extensions.Options;
using ProductManagerAPI.Options;
using ProductManagerAPI.Data.Models;
using ProductManagerAPI.Data.Repositories;

namespace ProductManagerAPI.Jobs
{
    public sealed class UploadSingularProductJob(
        IProductRepository productRepository,
        IOptionsMonitor<SendToIcEncOptions> options,
        ILogger<UploadSingularProductJob> logger
    )
    {
        private readonly IProductRepository _productRepository = productRepository;
        private readonly IOptionsMonitor<SendToIcEncOptions> _options = options;
        private readonly ILogger<UploadSingularProductJob> _logger = logger;

        [AutomaticRetry(Attempts = 0)]
        public Task RunAsync(
            SendToIcEncJobRequest request,
            PerformContext performContext,
            CancellationToken cancellationToken
        ) {
            ArgumentNullException.ThrowIfNull(performContext);
            return ExecuteAsync(
                request,
                new HangfireSendJobExecutionContext(performContext),
                cancellationToken
            );
        }

        public async Task ExecuteAsync(
            SendToIcEncJobRequest request,
            IExportJobExecutionContext context,
            CancellationToken cancellationToken
        ) {
            ArgumentNullException.ThrowIfNull(request);
            ArgumentNullException.ThrowIfNull(context);

            _logger.LogInformation(
                "IC-ENC send simulation job starting. JobId: {JobId}. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}. ExpectedEdition: {ExpectedEdition}. ExpectedUpdate: {ExpectedUpdate}",
                context.JobId,
                request.DatasetName,
                request.CorrelationId,
                request.ExpectedEdition,
                request.ExpectedUpdate
            );

            ClearTerminalMetadata(context);
            context.SetJobParameter(
                ExportJobParameterNames.Mode,
                SendToIcEncContract.SimulationMode
            );
            context.SetJobParameter(
                ExportJobParameterNames.DeliveryStatus,
                SendToIcEncContract.NotDeliveredStatus
            );

            try {
                if (request.Mode != SendToIcEncMode.Simulation ||
                    _options.CurrentValue.Mode != SendToIcEncMode.Simulation) {
                    throw CreateSafeFailure(
                        context,
                        SendToIcEncContract.ConfigurationChangedCode,
                        SendToIcEncContract.ConfigurationChangedMessage
                    );
                }

                var product = await _productRepository.GetCurrentByNameAsync(request.DatasetName);
                if (product == null) {
                    throw CreateSafeFailure(
                        context,
                        ExportJobContract.ProductNotFoundCode,
                        ExportJobContract.ProductNoLongerAvailableMessage
                    );
                }

                if (product.State != ProductState.Exported) {
                    throw CreateSafeFailure(
                        context,
                        SendToIcEncContract.InvalidStateCode,
                        SendToIcEncContract.InvalidStateJobMessage
                    );
                }

                if (product.EditionNo != request.ExpectedEdition ||
                    product.UpdateNo != request.ExpectedUpdate) {
                    throw CreateSafeFailure(
                        context,
                        ExportJobContract.ProductVersionChangedCode,
                        ExportJobContract.ProductVersionChangedMessage
                    );
                }

                cancellationToken.ThrowIfCancellationRequested();

                // Simulation intentionally performs no transport, acknowledgement,
                // Product-state mutation, history write or delivery-record write.
                context.SetJobParameter(
                    ExportJobParameterNames.Mode,
                    SendToIcEncContract.SimulationMode
                );
                context.SetJobParameter(
                    ExportJobParameterNames.OperationOutcome,
                    SendToIcEncContract.SimulationCompletedOutcome
                );
                context.SetJobParameter(
                    ExportJobParameterNames.DeliveryStatus,
                    SendToIcEncContract.NotDeliveredStatus
                );
                context.SetJobParameter(
                    ExportJobParameterNames.ResultCode,
                    SendToIcEncContract.CompletedCode
                );
                context.SetJobParameter(
                    ExportJobParameterNames.ResultMessage,
                    SendToIcEncContract.CompletedMessage
                );

                _logger.LogInformation(
                    "IC-ENC send simulation completed without delivery. JobId: {JobId}. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}",
                    context.JobId,
                    request.DatasetName,
                    request.CorrelationId
                );
            }
            catch (SendToIcEncJobException) {
                throw;
            }
            catch (Exception ex) {
                context.SetJobParameter(
                    ExportJobParameterNames.ErrorCode,
                    SendToIcEncContract.FailedCode
                );
                context.SetJobParameter(
                    ExportJobParameterNames.ErrorMessage,
                    SendToIcEncContract.FailedMessage
                );
                _logger.LogError(
                    ex,
                    "IC-ENC send simulation failed. JobId: {JobId}. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}",
                    context.JobId,
                    request.DatasetName,
                    request.CorrelationId
                );
                throw;
            }
        }

        private static void ClearTerminalMetadata(IExportJobExecutionContext context) {
            context.SetJobParameter(ExportJobParameterNames.OperationOutcome, null);
            context.SetJobParameter(ExportJobParameterNames.ResultCode, null);
            context.SetJobParameter(ExportJobParameterNames.ResultMessage, null);
            context.SetJobParameter(ExportJobParameterNames.ErrorCode, null);
            context.SetJobParameter(ExportJobParameterNames.ErrorMessage, null);
        }

        private static SendToIcEncJobException CreateSafeFailure(
            IExportJobExecutionContext context,
            string code,
            string message
        ) {
            context.SetJobParameter(ExportJobParameterNames.ErrorCode, code);
            context.SetJobParameter(ExportJobParameterNames.ErrorMessage, message);
            return new SendToIcEncJobException(code, message);
        }

        private sealed class HangfireSendJobExecutionContext(PerformContext context)
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

    public sealed class SendToIcEncJobException(string code, string message)
        : Exception($"{code}: {message}")
    {
        public string Code { get; } = code;
    }
}
