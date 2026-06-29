using ProductCatalogueAPI.Data.Repositories;
using Serilog.Core;

namespace ProductCatalogueAPI.Jobs
{
    public class UploadSingularProductJob(IProductRepository repository, ILogger<UploadSingularProductJob> logger) : IBackgroundJob<string>
    {
        private readonly IProductRepository _repository = repository;
        private readonly ILogger<UploadSingularProductJob> _logger = logger;
        public async Task RunAsync(string name, CancellationToken token) {
            _logger.LogInformation("Job: {jobName} started", nameof(UploadSingularProductJob));

            _logger.LogWarning("UploadProductJob is not yet implemented.");
            //await _repository.UpdateAsync(Guid.NewGuid(), "Name", 2, "system");
            throw new NotImplementedException();

            _logger.LogInformation("Job: {jobName} finished", nameof(UploadSingularProductJob));
        }
    }
}