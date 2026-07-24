using ProductManagerAPI.Data.Models;
using ProductManagerAPI.Data.Repositories;
using ProductManagerAPI.Services.Export;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using static ProductManagerAPI.Models.RequestTypes;

namespace ProductManagerAPI.Services.Operations
{
    public class ExportOperationService(
        IProductManager productManager,
        IExportService exportService,
        IProductRepository productRepository,
        ILogger<ExportOperationService> logger
    ) : IExportOperationService
    {
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IExportService _exportService = exportService;
        private readonly IProductRepository _productRepository = productRepository;
        private readonly ILogger<ExportOperationService> _logger = logger;

        public async Task<ExportOperationResult> ExecuteNewEditionAsync(
            string datasetName,
            ExportFormat exportTarget,
            string? user,
            CancellationToken cancellationToken = default,
            Action? beforeMutation = null
        ) {
            if (exportTarget != ExportFormat.S100)
                throw new ArgumentOutOfRangeException(nameof(exportTarget), exportTarget, "Only S100 is currently supported.");

            cancellationToken.ThrowIfCancellationRequested();

            var currentState = await _productRepository.GetCurrentByNameAsync(datasetName);
            if (currentState is not null && currentState.State is not ProductState.Idle) {
                throw new ExportOperationRejectedException(
                    $"A New edition could not be created now. Current product state: {currentState.State}."
                );
            }

            cancellationToken.ThrowIfCancellationRequested();
            beforeMutation?.Invoke();

            var dataset = await _electronicProductManager.CreateNewEditionAsync(datasetName);

            var yaml = SerializeDataset(dataset);
            if (string.IsNullOrEmpty(yaml))
                throw new ExportSourceUnavailableException(datasetName);

            var update = dataset.Update;
            var edition = dataset.Edition
                ?? throw new ExportSourceUnavailableException(datasetName);

            var exportResult = _exportService.CreateS100Export(
                datasetName,
                edition,
                update,
                _electronicProductManager.OutputFolder,
                yaml
            );

            await _electronicProductManager.CreateAttachmentAsync(
                datasetName,
                ExportTypes.NewEdition,
                yaml,
                exportResult.Index,
                exportResult.Sign
            );

            await _productRepository.AppendAsync(
                datasetName,
                ProductState.Exported,
                "S-101",
                edition,
                update,
                user
            );

            _logger.LogInformation(
                "New Edition operation completed for dataset {DatasetName}. Edition: {Edition}. Update: {Update}",
                datasetName,
                edition,
                update
            );

            return new ExportOperationResult(
                ExportOperationContract.ExportCompletedCode,
                ExportOperationContract.ExportCompletedMessage
            );
        }

        protected virtual string SerializeDataset(S100FC.YAML.Dataset dataset) =>
            dataset.Serialize();

        private static uint? ToUnsigned(int? value) =>
            value.HasValue ? checked((uint)value.Value) : null;

        public async Task<ExportOperationResult> ExecuteRollbackAsync(
            string datasetName,
            CancellationToken cancellationToken = default,
            Action? beforeMutation = null
        ) {
            cancellationToken.ThrowIfCancellationRequested();

            var product = _electronicProductManager.ElectronicProduct(datasetName)
                ?? throw new InvalidOperationException($"Electronic product '{datasetName}' was not found.");

            var currentState = await _productRepository.GetCurrentByNameAsync(datasetName);
            if (currentState is null ||
                currentState.State is not (ProductState.Exported or ProductState.Frozen)) {
                throw new ExportOperationRejectedException(
                    $"A rollback could not be performed now. Current product state: {currentState?.State}."
                );
            }

            var oldEdition = checked((uint)product.editionNumber!.Value);
            uint? oldUpdate = checked((uint)product.updateNumber.GetValueOrDefault());

            if (oldEdition <= 1) {
                throw new ExportOperationRejectedException(
                    "Dataset cannot be rolled back further."
                );
            }

            cancellationToken.ThrowIfCancellationRequested();
            beforeMutation?.Invoke();

            await _electronicProductManager.RollBackAsync(datasetName);

            var cleanupSucceeded = _exportService.DeleteExport(
                datasetName,
                _electronicProductManager.OutputFolder,
                oldEdition,
                oldUpdate
            );

            await _productRepository.AppendAsync(
                datasetName,
                ProductState.Idle,
                "S-128",
                checked((uint)product.editionNumber!.Value),
                ToUnsigned(product.updateNumber)
            );

            ExportOperationWarning? warning = null;
            if (!cleanupSucceeded) {
                warning = new ExportOperationWarning(
                    ExportOperationContract.RollbackCleanupFailedCode,
                    ExportOperationContract.RollbackCleanupFailedMessage
                );
                _logger.LogWarning(
                    "Rollback completed for dataset {DatasetName}, but export output cleanup failed.",
                    datasetName
                );
            }

            return new ExportOperationResult(
                ExportOperationContract.RollbackCompletedCode,
                ExportOperationContract.RollbackCompletedMessage,
                warning
            );
        }
    }
}
