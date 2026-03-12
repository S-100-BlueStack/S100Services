using System.Text.Json;

namespace ProductCatalogueService.Models
{
    public static class RequestTypes
    {
        public enum ExportType : int
        {
            NewEdition = 1,
            Update = 2,
            Reissue = 3
        };

        public enum SpecificUsage : int
        {
            NavigationalPurposeOverview = 1,
            NavigationalPurposeGeneral = 2,
            NavigationalPurposeCoastal = 3,
            NavigationalPurposeApproach = 4,
            NavigationalPurposeHarbour = 5,
            NavigationalPurposeBerthing = 6,
        };

        public class CreateProductRequest
        {
            public required string Name { get; set; }
            public JsonElement Aoi { get; set; }
            public SpecificUsage UsageBand { get; set; }
        }
    }
}


