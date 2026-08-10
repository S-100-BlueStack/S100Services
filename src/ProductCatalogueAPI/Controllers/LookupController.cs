using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Export;

namespace ProductCatalogueAPI.Controllers
{
    [AllowAnonymous]
    // [Authorize("productmanager:access")]
    [ApiController]
    [Route("[controller]")]
    public class LookupController(IOptionsMonitor<SendToIcEncOptions> sendToIcEncOptions) : ControllerBase
    {
        private readonly IOptionsMonitor<SendToIcEncOptions> _sendToIcEncOptions = sendToIcEncOptions;

        [HttpGet("capabilities")]
        [ProducesResponseType(typeof(ProductCatalogueCapabilitiesResponse), StatusCodes.Status200OK)]
        public IActionResult GetCapabilities() {
            var mode = _sendToIcEncOptions.CurrentValue.Mode;
            var available = mode == SendToIcEncMode.Simulation;
            var reason = mode switch {
                SendToIcEncMode.Simulation => null,
                SendToIcEncMode.Disabled => SendToIcEncContract.DisabledMessage,
                _ => SendToIcEncContract.UnsupportedModeMessage
            };

            return Ok(new ProductCatalogueCapabilitiesResponse {
                SendToIcEnc = new SendToIcEncCapabilityResponse {
                    Mode = mode.ToString(),
                    Available = available,
                    Reason = reason
                }
            });
        }

        [HttpGet("productstates")]
        public IActionResult GetProductStates() {
            var values = Enum.GetValues<ResponseTypes.ProductStatus>()
                .Select(e => new {
                    Id = (int)e,
                    Name = e switch {
                        //ResponseTypes.ProductStatus.Ready => e.ToString(),
                        //ResponseTypes.ProductStatus.NewEdition => "New edition",
                        //ResponseTypes.ProductStatus.NewUpdate => "New update",
                        //ResponseTypes.ProductStatus.Invalid => e.ToString(),
                        //ResponseTypes.ProductStatus.InTransit => "In transit",

                        _ => e.ToString()
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

        [HttpGet("exportformats")]
        public IActionResult GetExportFormats() {
            var values = ExportTargetContract.AllowedTargets
                .Select(name => new {
                    Name = name
                });

            return Ok(values);
        }
    }
}
