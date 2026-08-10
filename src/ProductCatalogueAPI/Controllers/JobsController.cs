using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Jobs;

namespace ProductCatalogueAPI.Controllers
{
    [AllowAnonymous]
    [ApiController]
    [Route("jobs")]
    public sealed class JobsController(IJobStatusService jobStatusService) : ControllerBase
    {
        private readonly IJobStatusService _jobStatusService = jobStatusService;

        [HttpGet("active", Name = "GetActiveProductManagerJobs")]
        [ProducesResponseType(typeof(IReadOnlyList<ExportJobStatusResponse>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status400BadRequest, "application/json")]
        public IActionResult GetActiveJobs([FromQuery] string? datasetName) {
            if (string.IsNullOrWhiteSpace(datasetName)) {
                return new ObjectResult(new ExportJobErrorResponse {
                    Code = ExportJobContract.DatasetNameRequiredCode,
                    Message = ExportJobContract.DatasetNameRequiredMessage
                }) {
                    StatusCode = StatusCodes.Status400BadRequest,
                    ContentTypes = { "application/json" }
                };
            }

            return Ok(_jobStatusService.GetActiveJobs(datasetName));
        }

        [HttpGet("{jobId}", Name = "GetProductManagerJob")]
        [ProducesResponseType(typeof(ExportJobStatusResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status404NotFound, "application/json")]
        public IActionResult GetJob(string jobId) {
            var response = _jobStatusService.GetJob(jobId);
            if (response != null)
                return Ok(response);

            return new ObjectResult(new ExportJobErrorResponse {
                Code = ExportJobContract.JobNotFoundCode,
                Message = ExportJobContract.JobNotFoundMessage
            }) {
                StatusCode = StatusCodes.Status404NotFound,
                ContentTypes = { "application/json" }
            };
        }
    }
}
