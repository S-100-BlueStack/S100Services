using ProductManagerAPI.Data.Repositories;
using ProductManagerAPI.Services.Locking;
using S100FC.ProductCatalogue;

namespace ProductManagerAPI.Jobs
{
    public class UploadSingularProductJob(IProductRepository repository, ILogger<UploadSingularProductJob> logger, IDatasetLockService datasetLockService, IProductManager productManager)
    {
        private readonly IProductRepository _repository = repository;
        private readonly ILogger<UploadSingularProductJob> _logger = logger;
        private readonly IDatasetLockService _datasetLockService = datasetLockService;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        public async Task RunAsync(string datasetName, CancellationToken token, string user = "") {
            _logger.LogInformation("Job: {jobName} started", nameof(UploadSingularProductJob));

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(datasetName, token);

            if (datasetLock == null) {
                _logger.LogWarning("UploadProductJob could not acquire lock for dataset {datasetName}. Another job may be running. Exiting.", datasetName);
                await _repository.AppendAsync(datasetName, Data.Models.ProductState.Frozen, "S-128", 5, 0, user);
                return;
            }

            var product = _electronicProductManager.ElectronicProduct(datasetName);

            if (product == null) {
                _logger.LogWarning("UploadProductJob could not find product {datasetName}. Exiting.", datasetName);
                await _repository.AppendAsync(datasetName, Data.Models.ProductState.Frozen, "S-128", 5, 0, user);
                return;
            }


            _logger.LogWarning("UploadProductJob is not yet implemented fully. Waiting 10 seconds and assume dataset was sent and accepted for now.");
            await Task.Delay(10, token);
            await _repository.AppendAsync(datasetName, Data.Models.ProductState.Idle, "S-128", product.editionNumber.GetValueOrDefault(), product.updateNumber.GetValueOrDefault());

            _logger.LogInformation("Job: {jobName} finished", nameof(UploadSingularProductJob));
        }
    }
}