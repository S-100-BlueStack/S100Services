using Hangfire;
using Hangfire.Server;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Jobs;

namespace ProductCatalogueAPI.Jobs
{
    public sealed class UploadSingularProductJob(
        IProductRepository productRepository,
        IOptionsMonitor<SendToIcEncOptions> options,
        ILogger<UploadSingularProductJob> logger,
        IIcEncDeliveryRepository? deliveryRepository = null,
        IIcEncTransport? transport = null
    )
    {
        private readonly IProductRepository _productRepository = productRepository;
        private readonly IOptionsMonitor<SendToIcEncOptions> _options = options;
        private readonly ILogger<UploadSingularProductJob> _logger = logger;
        private readonly IIcEncDeliveryRepository? _deliveryRepository = deliveryRepository;
        private readonly IIcEncTransport? _transport = transport;

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

            if (request.Mode == SendToIcEncMode.Live) {
                await ExecuteLiveAsync(request, context, cancellationToken);
                return;
            }

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

                var allowsSevenCsValidationOverride = request.AllowSevenCsValidationFailure &&
                    product.State == ProductState.Error &&
                    string.Equals(product.ErrorCode, SendToIcEncContract.SevenCsValidationFailedCode, StringComparison.Ordinal);
                if (product.State is not (ProductState.Exported or ProductState.ReadyForDistribution) && !allowsSevenCsValidationOverride) {
                    throw CreateSafeFailure(
                        context,
                        SendToIcEncContract.InvalidStateCode,
                        SendToIcEncContract.InvalidStateJobMessage
                    );
                }

                if (allowsSevenCsValidationOverride) {
                    _logger.LogWarning(
                        "IC-ENC send simulation executing with manual SevenCs validation override. JobId: {JobId}. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}",
                        context.JobId,
                        request.DatasetName,
                        request.CorrelationId
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

        private async Task ExecuteLiveAsync(SendToIcEncJobRequest request, IExportJobExecutionContext context, CancellationToken cancellationToken) {
            ClearTerminalMetadata(context);
            context.SetJobParameter(ExportJobParameterNames.Mode, SendToIcEncContract.LiveMode);
            context.SetJobParameter(ExportJobParameterNames.DeliveryStatus, SendToIcEncContract.NotDeliveredStatus);
            if (_options.CurrentValue.Mode != SendToIcEncMode.Live || _deliveryRepository is null || _transport is null)
                throw CreateSafeFailure(context, SendToIcEncContract.ConfigurationChangedCode, SendToIcEncContract.ConfigurationChangedMessage);
            if (!Enum.TryParse<ProductSpecification>(request.ProductSpecification, out var specification) ||
                specification is not (ProductSpecification.S57 or ProductSpecification.S101) || request.AllowSevenCsValidationFailure)
                throw CreateSafeFailure(context, SendToIcEncContract.InvalidStateCode, SendToIcEncContract.InvalidStateJobMessage);

            IcEncDelivery? delivery;
            try {
                delivery = await _deliveryRepository.ReserveAsync(request.DatasetName, specification, request.ExpectedEdition, request.ExpectedUpdate,
                    context.JobId, DateTime.UtcNow, cancellationToken);
            }
            catch (Exception ex) {
                _logger.LogError(ex, "Could not reserve IC-ENC delivery for {DatasetName}.", request.DatasetName);
                throw CreateSafeFailure(context, SendToIcEncContract.FailedCode, SendToIcEncContract.FailedMessage);
            }
            if (delivery is null)
                throw CreateSafeFailure(context, SendToIcEncContract.InvalidStateCode, SendToIcEncContract.InvalidStateJobMessage);

            try {
                var remoteDirectory = await _transport.UploadAsync(delivery, cancellationToken);
                await _deliveryRepository.MarkDeliveredAsync(delivery.Id, DateTime.UtcNow, CancellationToken.None);
                context.SetJobParameter(ExportJobParameterNames.OperationOutcome, SendToIcEncContract.DeliveredOutcome);
                context.SetJobParameter(ExportJobParameterNames.DeliveryStatus, SendToIcEncContract.DeliveredStatus);
                context.SetJobParameter(ExportJobParameterNames.ResultCode, SendToIcEncContract.DeliveredCode);
                context.SetJobParameter(ExportJobParameterNames.ResultMessage, SendToIcEncContract.DeliveredMessage);
                _logger.LogInformation("IC-ENC delivery completed. Dataset: {DatasetName}. Product: {Specification}. Directory: {RemoteDirectory}. DeliveryId: {DeliveryId}",
                    request.DatasetName, specification, remoteDirectory, delivery.Id);
            }
            catch (Exception ex) {
                // Transport exceptions can occur after the receiver has accepted data. Never retry automatically.
                context.SetJobParameter(ExportJobParameterNames.DeliveryStatus, SendToIcEncContract.UncertainStatus);
                try {
                    await _deliveryRepository.MarkUncertainAsync(delivery.Id, DateTime.UtcNow, "Inspect IC-ENC intake before retrying or releasing this product.", CancellationToken.None);
                }
                catch (Exception persistenceError) {
                    _logger.LogCritical(persistenceError, "IC-ENC delivery outcome could not be persisted. DeliveryId: {DeliveryId}", delivery.Id);
                }
                _logger.LogError(ex, "IC-ENC delivery requires reconciliation. Dataset: {DatasetName}. DeliveryId: {DeliveryId}", request.DatasetName, delivery.Id);
                throw CreateSafeFailure(context, SendToIcEncContract.DeliveryUncertainCode, SendToIcEncContract.DeliveryUncertainMessage);
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
