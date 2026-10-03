using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Controllers
{
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/checkin")]
    [Produces("application/json")]
    public sealed class CheckInController(/*IDataRepository repository, */ILogger<CheckInController> logger) : ControllerBase
    {
        //private readonly IDataRepository repository = repository;
        private readonly ILogger<CheckInController> logger = logger;
    }
}
