using ProductCatalogueService.Data.Repositories;
using Serilog.Core;

namespace ProductCatalogueService.Jobs
{
    public class UploadAllProductsJob(IProductRepository repository, ILogger<UploadAllProductsJob> logger) : IBackgroundJob
    {
        private readonly IProductRepository _repository = repository;
        private readonly ILogger<UploadAllProductsJob> _logger = logger;
        public async Task RunAsync(CancellationToken token) {
            _logger.LogInformation("Job: {jobName} started", nameof(UploadAllProductsJob));
     
            //await _repository.UpdateAsync(Guid.NewGuid(), "Name", 2, "system");
            throw new NotImplementedException();
            _logger.LogInformation("Job: {jobName} finished", nameof(UploadAllProductsJob));

        }
    }
}