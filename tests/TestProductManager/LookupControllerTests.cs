using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ProductManagerAPI.Options;
using ProductManagerAPI.Controllers;
using ProductManagerAPI.Models;
using System.Text.Json;

namespace TestProductManagerAPI
{
    public class LookupControllerTests
    {
        [Fact]
        public void ExportFormatsExposeCanonicalStringMetadataWithoutNumericIdsOrBoth() {
            var controller = Controller(SendToIcEncMode.Disabled);
            var result = Assert.IsType<OkObjectResult>(controller.GetExportFormats());
            var json = JsonSerializer.Serialize(result.Value);
            using var document = JsonDocument.Parse(json);

            var items = document.RootElement.EnumerateArray().ToArray();
            Assert.Equal(3, items.Length);
            Assert.Equal(new[] { "All", "S100", "S57" }, items.Select(item => item.GetProperty("Name").GetString()));
            foreach (var item in items) {
                Assert.Single(item.EnumerateObject());
                Assert.False(item.TryGetProperty("Id", out _));
            }

            Assert.DoesNotContain("Both", json);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void DisabledCapabilityIsBackendOwnedAndIncludesSafeReason() {
            var result = Assert.IsType<OkObjectResult>(Controller(SendToIcEncMode.Disabled).GetCapabilities());
            var response = Assert.IsType<ProductCatalogueCapabilitiesResponse>(result.Value);

            Assert.Equal("Disabled", response.SendToIcEnc.Mode);
            Assert.False(response.SendToIcEnc.Available);
            Assert.Equal("Send to IC-ENC is disabled.", response.SendToIcEnc.Reason);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void SimulationCapabilityIsAvailableWithoutClaimingDelivery() {
            var result = Assert.IsType<OkObjectResult>(Controller(SendToIcEncMode.Simulation).GetCapabilities());
            var response = Assert.IsType<ProductCatalogueCapabilitiesResponse>(result.Value);

            Assert.Equal("Simulation", response.SendToIcEnc.Mode);
            Assert.True(response.SendToIcEnc.Available);
            Assert.Null(response.SendToIcEnc.Reason);
        }

        private static LookupController Controller(SendToIcEncMode mode) => new(
            new StaticOptionsMonitor<SendToIcEncOptions>(new SendToIcEncOptions { Mode = mode })
        );

        private sealed class StaticOptionsMonitor<T>(T value) : IOptionsMonitor<T>
        {
            public T CurrentValue => value;
            public T Get(string? name) => value;
            public IDisposable? OnChange(Action<T, string?> listener) => null;
        }
    }
}
