using Microsoft.Graph.Reports.GetPrinterArchivedPrintJobsWithPrinterIdWithStartDateTimeWithEndDateTime;
using ProductCatalogueAPI.Data.Repositories;
using S100FC.ProductCatalogue;
using Serilog.Core;

namespace ProductCatalogueAPI.Jobs
{
    public class UploadAllProductsJob(IProductRepository repository, IProductManager productManager, ILogger<UploadAllProductsJob> logger) : IBackgroundJob
    {
        private readonly IProductRepository _repository = repository;
        private readonly IProductManager _productManager = productManager;
        private readonly ILogger<UploadAllProductsJob> _logger = logger;
        public async Task RunAsync(CancellationToken token) {
            _logger.LogInformation("Job: {jobName} started", nameof(UploadAllProductsJob));


            // 1) Fetch all eligble products

            var products = await _repository.GetEligibleProductsAsync();

            foreach(var productName in products) {
                _logger.LogInformation("Uploading product: {productName}", productName);

                //var product = _productManager.ElectronicProductManager[productName];

                await UploadProductAsync(productName, token);
            }











            throw new NotImplementedException();
            _logger.LogInformation("Job: {jobName} finished", nameof(UploadAllProductsJob));

        }

        private async Task UploadProductAsync(string name, CancellationToken token) {
            _logger.LogInformation("Job: {jobName} uploading product {productName}", nameof(UploadAllProductsJob), name);
            // 1) Fetch product details
            // 2) Upload to IC-ENC
            // 3) Update database record with new state and timestamp
        }
    }
}