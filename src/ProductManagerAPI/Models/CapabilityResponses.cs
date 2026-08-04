using System.Text.Json.Serialization;

namespace ProductManagerAPI.Models
{
    public sealed class ProductCatalogueCapabilitiesResponse
    {
        [JsonPropertyName("sendToIcEnc")]
        public required SendToIcEncCapabilityResponse SendToIcEnc { get; init; }
    }

    public sealed class SendToIcEncCapabilityResponse
    {
        [JsonPropertyName("mode")]
        public required string Mode { get; init; }

        [JsonPropertyName("available")]
        public required bool Available { get; init; }

        [JsonPropertyName("reason")]
        public string? Reason { get; init; }
    }
}
