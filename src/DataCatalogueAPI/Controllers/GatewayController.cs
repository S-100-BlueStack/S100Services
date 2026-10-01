using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Controllers
{
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/gateway")]
    [Produces("application/json")]
    public sealed class GatewayController(/*IDataRepository repository, */ILogger<GatewayController> logger) : ControllerBase
    {
        //private readonly IDataRepository repository = repository;
        private readonly ILogger<GatewayController> logger = logger;
    }
}
