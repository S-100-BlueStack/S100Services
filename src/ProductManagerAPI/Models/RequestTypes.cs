using System.Text.Json;

namespace ProductManagerAPI.Models
{
    public static class RequestTypes
    {
        public enum ExportFormat
        {
            Both,
            S100,
            S57
        }

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
            public int OptimumDisplayScale { get; set; }
        }
    }
}


