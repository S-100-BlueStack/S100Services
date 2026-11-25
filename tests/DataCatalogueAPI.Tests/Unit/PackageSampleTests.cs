using System.Text.Json;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class PackageSampleTests
{
    [Fact]
    public void ENC_workspace_samples_are_distinct_closed_polygons() {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Samples", "Workspaces", "ENC.json")));
        var polygons = new HashSet<string>();
        foreach (var workspace in document.RootElement.EnumerateArray()) {
            var name = workspace.GetProperty("displayName").GetString();
            var aoi = workspace.GetProperty("aoi");
            Assert.Equal(JsonValueKind.Object, aoi.GetProperty("spatialReference").ValueKind);
            var rings = aoi.GetProperty("rings").EnumerateArray().ToArray();
            Assert.NotEmpty(rings);

            // Workspace coverage can contain irregular polygons and multiple rings.
            // Only the generalized Package AOI is required to be rectangular.
            foreach (var ring in rings) {
                Assert.True(ring.GetArrayLength() >= 4, $"Workspace '{name}' has a ring with too few positions.");
                var points = ring.EnumerateArray().Select(point => (X: point[0].GetDouble(), Y: point[1].GetDouble())).ToArray();
                Assert.All(points, point => Assert.True(double.IsFinite(point.X) && double.IsFinite(point.Y), $"Workspace '{name}' has a non-finite coordinate."));
                Assert.Equal(points[0], points[^1]);
                Assert.True(points.Take(points.Length - 1).Distinct().Count() >= 3, $"Workspace '{name}' has a ring with fewer than three distinct vertices.");
            }
            Assert.True(polygons.Add(aoi.GetRawText()), $"Workspace '{name}' has duplicate coverage.");
        }
        Assert.NotEmpty(polygons);
    }
}
