using Microsoft.AspNetCore.Mvc;
using ProductManagerAPI.Controllers;
using System.Text.Json;

namespace TestProductManagerAPI
{
    public class LookupControllerTests
    {
        [Fact]
        public void ExportFormatsExposeCanonicalStringMetadataWithoutNumericIdsOrBoth() {
            var controller = new LookupController();

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
    }
}
