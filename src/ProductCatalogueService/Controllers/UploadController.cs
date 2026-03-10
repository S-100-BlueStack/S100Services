using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using S100FC.ProductCatalogue;

namespace ProductCatalogueService.Controllers
{
    public class UploadController(ILogger<UploadController> logger, IMemoryCache cache, IProductManager productManager) : ControllerBase
    {
    }
}
