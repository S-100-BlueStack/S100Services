using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductManagerAPI.Jobs;
using ProductManagerAPI.Models;
using ProductManagerAPI.Services.Jobs;

namespace ProductManagerAPI.Controllers
{
    [AllowAnonymous]
    [ApiController]
    [Route("jobs")]
    public sealed class JobsController(IJobStatusService jobStatusService) : ControllerBase
    {
        private readonly IJobStatusService _jobStatusService = jobStatusService;

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
