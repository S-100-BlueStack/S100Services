using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using System.Security.Cryptography;

namespace ProductCatalogueAPI.Controllers
{
    [Authorize("productmanager:distribute")]
    [ApiController]
    [Route("[controller]")]
    public class UploadController(ILogger<UploadController> logger, IBackgroundJobClient backgroundJobClient, IRecurringJobManager recurringJobManager, IProductRepository productRepository) : ControllerBase
    {
        private readonly IBackgroundJobClient _backgroundJobClient = backgroundJobClient;
        private readonly IRecurringJobManager _recurringJobManager = recurringJobManager;
        private readonly ILogger<UploadController> _logger = logger;
        private readonly IProductRepository _productRepository = productRepository;


        /// <summary>
        /// Enqueues a singular product to send to IC-ENC immedietly.
        /// </summary>
        /// <returns>The job id</returns>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}", Name = "upload")]
        public async Task<IActionResult> UploadSingularProduct(string datasetName, CancellationToken cancellationToken) {
            _logger.LogInformation("{method}({jobType}. User: {user})", nameof(UploadSingularProduct), datasetName, User?.Identity?.Name ?? string.Empty);

            var product = await _productRepository.GetCurrentByNameAsync(datasetName);

            if (product == null)
                return NotFound();

            if (product.State == Data.Models.ProductState.Frozen)
                return BadRequest($"Product {datasetName} is frozen and cannot be uploaded.");

            if (product.State == Data.Models.ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be uploaded.");


            var id = _backgroundJobClient.Enqueue<UploadSingularProductJob>(j => j.RunAsync(datasetName, cancellationToken));
#if DEBUG
            var rng = new Random();
            var ranNum = rng.NextInt64(1, 4);
            if (ranNum == 1) {
                return this.UnprocessableEntity();
            }
            else if (ranNum == 2) {
                return this.Forbid();
            }
#endif

            return this.Ok(id);
        }


        /// <summary>
        /// Manually freezes a product so it will be excluded in the automatic upload to IC-ENC. 
        /// </summary>
        /// <returns>The job id</returns>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/freeze", Name = "freeze")]
        public async Task<IActionResult> FreezeProduct(string datasetName) {
            _logger.LogInformation("{method}({jobType}. User: {user})", nameof(FreezeProduct), datasetName, User?.Identity?.Name ?? string.Empty);

            var product = await _productRepository.GetCurrentByNameAsync(datasetName);

            if (product == null)
                return NotFound();

            if (product.State == Data.Models.ProductState.Frozen)
                return BadRequest($"Product {datasetName} is already frozen.");

            if (product.State == Data.Models.ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be frozen.");

            await _productRepository.AppendAsync(datasetName, Data.Models.ProductState.Frozen);


            return Ok();
        }

        /// <summary>
        /// Unfreezes a product so it will be included again in the automatic upload to IC-ENC. 
        /// </summary>
        /// <returns>The job id</returns>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/unfreeze", Name = "unfreeze")]
        public async Task<IActionResult> UnfreezeProduct(string datasetName) {
            _logger.LogInformation("{method}({jobType}. User: {user})", nameof(UnfreezeProduct), datasetName, User?.Identity?.Name ?? string.Empty);

            var product = await _productRepository.GetCurrentByNameAsync(datasetName);

            if (product == null)
                return NotFound();

            if (product.State != Data.Models.ProductState.Frozen)
                return BadRequest($"Product {datasetName} is not frozen and cannot be unfrozen.");

            await _productRepository.AppendAsync(datasetName, Data.Models.ProductState.Ready);


            return Ok();
        }

        /// <summary>
        /// Registers the recurring task to upload all eligble products to IC-ENC. If the JobId already exists, it will update the cron trigger for that job instead
        /// </summary>
        /// <returns>The job id</returns>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("full", Name = "upload-all")]
        public IActionResult AddRecurringJob([FromQuery] string jobId, CancellationToken cancellationToken, [FromQuery] string cron = "*/5 * * * *") {
            _logger.LogInformation("{method}({jobId}. Cron: {cron} User: {user})", nameof(AddRecurringJob), jobId, cron, User?.Identity?.Name ?? string.Empty);

            _recurringJobManager.AddOrUpdate<UploadAllProductsJob>(jobId, j => j.RunAsync(cancellationToken), cron);

            return Ok($"Recurring job {jobId} added/updated with schedule {cron}");
        }


        /// <summary>
        /// Removes a recurring job given a jobId if it exist.
        /// </summary>
        /// <returns>Note: It will always return Ok regardless of the job existing in the first place.</returns>
        [HttpDelete("recurring/{jobId}")]
        public IActionResult RemoveRecurringJob(string jobId) {
            _logger.LogInformation("{method}({jobId}. User: {user})", nameof(RemoveRecurringJob), jobId, User?.Identity?.Name ?? string.Empty);
            _recurringJobManager.RemoveIfExists(jobId);
            return Ok($"Recurring job {jobId} removed");
        }

        /// <summary>
        /// Enqueues a singular product to send to IC-ENC with a delay specified in seconds.
        /// </summary>
        /// <returns>The job id</returns>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/delayed", Name = "uploadWithDelay")]
        public async Task<IActionResult> UploadSingularProductWithDelay(string datasetName, [FromQuery] int seconds, CancellationToken cancellationToken) {
            _logger.LogInformation("{method}({jobType}. User: {user})", nameof(UploadSingularProduct), datasetName, User?.Identity?.Name ?? string.Empty);

            var product = await _productRepository.GetCurrentByNameAsync(datasetName);

            if (product == null)
                return NotFound();

            if (product.State == Data.Models.ProductState.Frozen)
                return BadRequest($"Product {datasetName} is frozen and cannot be uploaded.");

            if(product.State == Data.Models.ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be uploaded.");

            var id = _backgroundJobClient.Schedule<UploadSingularProductJob>(j => j.RunAsync(datasetName, cancellationToken), TimeSpan.FromSeconds(seconds));


            return this.Ok(id);
        }
    }
}