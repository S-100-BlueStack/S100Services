using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Models;

namespace ProductCatalogueAPI.Controllers
{
    [Authorize("productmanager:access")]
    [ApiController]
    [Route("[controller]")]
    public class LookupController : ControllerBase
    {
        [HttpGet("productstates")]
        public IActionResult GetProductStates() {
            var values = Enum.GetValues<ResponseTypes.ProductStatus>()
                .Select(e => new {
                    Id = (int)e,
                    Name = e switch {
                        ResponseTypes.ProductStatus.Idle => e.ToString(),
                        ResponseTypes.ProductStatus.Exported => e.ToString(),
                        ResponseTypes.ProductStatus.Frozen => e.ToString(),
                        ResponseTypes.ProductStatus.InTransit => "In transit",
                        ResponseTypes.ProductStatus.Rejected => e.ToString(),
                        ResponseTypes.ProductStatus.Invalid => e.ToString(),
                        ResponseTypes.ProductStatus.NewUpdate => "New Update",
                        _ => throw new InvalidOperationException()
                    }
                });

            return Ok(values);
        }

        [HttpGet("specificusages")]
        public IActionResult GetSpecificUsages() {
            var values = Enum.GetValues<RequestTypes.SpecificUsage>()
                .Select(e => new {
                    Id = (int)e,
                    Name = e switch {
                        RequestTypes.SpecificUsage.NavigationalPurposeOverview => "Navigational Purpose Overview",
                        RequestTypes.SpecificUsage.NavigationalPurposeGeneral => "Navigational Purpose General",
                        RequestTypes.SpecificUsage.NavigationalPurposeCoastal => "Navigational Purpose Coastal",
                        RequestTypes.SpecificUsage.NavigationalPurposeApproach => "Navigational Purpose Approach",
                        RequestTypes.SpecificUsage.NavigationalPurposeHarbour => "Navigational Purpose Harbour",
                        RequestTypes.SpecificUsage.NavigationalPurposeBerthing => "Navigational Purpose Berthing",

                        _ => throw new InvalidOperationException()
                    }
                });

            return Ok(values);
        }
    }
}