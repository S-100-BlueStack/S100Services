using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Controllers
{
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/data")]
    [Produces("application/json")]
    public sealed class DataController(/*IDataRepository repository, */ILogger<DataController> logger) : ControllerBase
    {
        //private readonly IDataRepository repository = repository;
        private readonly ILogger<DataController> logger = logger;
    }
}
