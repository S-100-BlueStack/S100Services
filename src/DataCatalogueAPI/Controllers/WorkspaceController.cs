using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Controllers
{
    namespace DataCatalague.Api.Controllers
    {
        [ApiController]
        [ApiVersion(ApiVersions.V1Text)]
        [Route("api/v{version:apiVersion}/data")]
        [Produces("application/json")]
        public sealed class WorkspaceController(IWorkspaceRepository repository, ILogger<WorkspaceController> logger) : ControllerBase
        {
            private readonly IWorkspaceRepository repository = repository;
            private readonly ILogger<WorkspaceController> logger = logger;
        }
    }

}
