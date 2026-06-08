using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Controllers
{
    [Authorize("productmanager:distribute")]
    [ApiController]
    [Route("[controller]")]
    public class UploadController(
        ILogger<UploadController> logger,
        IBackgroundJobClient backgroundJobClient,
        IRecurringJobManager recurringJobManager,
        IProductRepository productRepository,
        IProductManager productManager) : ControllerBase
    {
        private readonly IBackgroundJobClient _backgroundJobClient = backgroundJobClient;
        private readonly IRecurringJobManager _recurringJobManager = recurringJobManager;
        private readonly ILogger<UploadController> _logger = logger;
        private readonly IProductRepository _productRepository = productRepository;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;

        /// <summary>
        /// Enqueues a singular product to send to IC-ENC immediately.
        /// </summary>
        /// <returns>The job id.</returns>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}", Name = "upload")]
        public async Task<IActionResult> UploadSingularProduct(
            string datasetName,
            CancellationToken cancellationToken) {
            _logger.LogInformation(
                "{method}({datasetName}. User: {user})",
                nameof(UploadSingularProduct),
                datasetName,
                User?.Identity?.Name ?? string.Empty);

            var productState = await GetProductStateAsync(datasetName);

            if (!productState.Exists)
                return NotFound();

            if (productState.State == ProductState.Frozen)
                return BadRequest($"Product {datasetName} is frozen and cannot be uploaded.");

            if (productState.State == ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be uploaded.");

            var id = _backgroundJobClient.Enqueue<UploadSingularProductJob>(
                job => job.RunAsync(datasetName, cancellationToken));

#if DEBUG
            var rng = new Random();
            var ranNum = rng.NextInt64(1, 4);

            if (ranNum == 1)
                return UnprocessableEntity();

            if (ranNum == 2)
                return Forbid();
#endif

            return Ok(id);
        }

        /// <summary>
        /// Manually freezes a product so it will be excluded in the automatic upload to IC-ENC.
        /// </summary>
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/freeze", Name = "freeze")]
        public async Task<IActionResult> FreezeProduct(string datasetName) {
            _logger.LogInformation(
                "{method}({datasetName}. User: {user})",
                nameof(FreezeProduct),
                datasetName,
                User?.Identity?.Name ?? string.Empty);

            var productState = await GetProductStateAsync(datasetName);

            if (!productState.Exists)
                return NotFound();

            if (productState.State == ProductState.Frozen)
                return BadRequest($"Product {datasetName} is already frozen.");

            if (productState.State == ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be frozen.");

            await _productRepository.AppendAsync(
                datasetName,
                ProductState.Frozen,
                owner: User?.Identity?.Name);

            return Ok();
        }

        /// <summary>
        /// Unfreezes a product so it will be included again in the automatic upload to IC-ENC.
        /// </summary>
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/unfreeze", Name = "unfreeze")]
        public async Task<IActionResult> UnfreezeProduct(string datasetName) {
            _logger.LogInformation(
                "{method}({datasetName}. User: {user})",
                nameof(UnfreezeProduct),
                datasetName,
                User?.Identity?.Name ?? string.Empty);

            var productState = await GetProductStateAsync(datasetName);

            if (!productState.Exists)
                return NotFound();

            if (productState.State != ProductState.Frozen)
                return BadRequest($"Product {datasetName} is not frozen and cannot be unfrozen.");

            await _productRepository.AppendAsync(
                datasetName,
                ProductState.Idle,
                owner: User?.Identity?.Name);

            return Ok();
        }

        /// <summary>
        /// Registers the recurring task to upload all eligible products to IC-ENC.
        /// If the JobId already exists, it will update the cron trigger for that job instead.
        /// </summary>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("full", Name = "upload-all")]
        public IActionResult AddRecurringJob(
            [FromQuery] string jobId,
            CancellationToken cancellationToken,
            [FromQuery] string cron = "*/5 * * * *") {
            _logger.LogInformation(
                "{method}({jobId}. Cron: {cron} User: {user})",
                nameof(AddRecurringJob),
                jobId,
                cron,
                User?.Identity?.Name ?? string.Empty);

            _recurringJobManager.AddOrUpdate<UploadAllProductsJob>(
                jobId,
                job => job.RunAsync(cancellationToken),
                cron);

            return Ok($"Recurring job {jobId} added/updated with schedule {cron}");
        }

        /// <summary>
        /// Removes a recurring job given a jobId if it exists.
        /// </summary>
        /// <returns>It always returns Ok regardless of whether the job existed.</returns>
        [HttpDelete("recurring/{jobId}")]
        public IActionResult RemoveRecurringJob(string jobId) {
            _logger.LogInformation(
                "{method}({jobId}. User: {user})",
                nameof(RemoveRecurringJob),
                jobId,
                User?.Identity?.Name ?? string.Empty);

            _recurringJobManager.RemoveIfExists(jobId);

            return Ok($"Recurring job {jobId} removed");
        }

        /// <summary>
        /// Enqueues a singular product to send to IC-ENC with a delay specified in seconds.
        /// </summary>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/delayed", Name = "uploadWithDelay")]
        public async Task<IActionResult> UploadSingularProductWithDelay(
            string datasetName,
            [FromQuery] int seconds,
            CancellationToken cancellationToken) {
            _logger.LogInformation(
                "{method}({datasetName}. User: {user})",
                nameof(UploadSingularProductWithDelay),
                datasetName,
                User?.Identity?.Name ?? string.Empty);

            var productState = await GetProductStateAsync(datasetName);

            if (!productState.Exists)
                return NotFound();

            if (productState.State == ProductState.Frozen)
                return BadRequest($"Product {datasetName} is frozen and cannot be uploaded.");

            if (productState.State == ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be uploaded.");

            var id = _backgroundJobClient.Schedule<UploadSingularProductJob>(
                job => job.RunAsync(datasetName, cancellationToken),
                TimeSpan.FromSeconds(seconds));

            return Ok(id);
        }

        private async Task<ProductStateLookup> GetProductStateAsync(string datasetName) {
            var product = _electronicProductManager.ElectronicProduct(datasetName);

            if (product == null)
                return ProductStateLookup.NotFound();

            var current = await _productRepository.GetCurrentByNameAsync(datasetName);

            // Products can exist in S-128 before Product Manager has written
            // any state history. In that case the product should behave as Idle.
            return ProductStateLookup.Found(current?.State ?? ProductState.Idle);
        }

        private sealed record ProductStateLookup(bool Exists, ProductState State)
        {
            public static ProductStateLookup Found(ProductState state) {
                return new ProductStateLookup(true, state);
            }

            public static ProductStateLookup NotFound() {
                return new ProductStateLookup(false, ProductState.Idle);
            }
        }
    }
}