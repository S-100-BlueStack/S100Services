using System.Text.Json;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class PackageSampleTests
{
    [Fact]
    public void ENC_workspace_samples_are_distinct_axis_aligned_rectangles() {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Samples", "Workspaces", "ENC.json")));
        var polygons = new HashSet<string>();
        foreach (var workspace in document.RootElement.EnumerateArray()) {
            var aoi = workspace.GetProperty("aoi");
            var ring = Assert.Single(aoi.GetProperty("rings").EnumerateArray());
            Assert.Equal(5, ring.GetArrayLength());
            var points = ring.EnumerateArray().Select(point => (X: point[0].GetDouble(), Y: point[1].GetDouble())).ToArray();
            Assert.Equal(points[0], points[^1]);
            Assert.Equal(2, points.Select(point => point.X).Distinct().Count());
            Assert.Equal(2, points.Select(point => point.Y).Distinct().Count());
            Assert.Equal(4, points.Take(4).Distinct().Count());
            for (var index = 0; index < 4; index++) {
                Assert.True(points[index].X == points[index + 1].X || points[index].Y == points[index + 1].Y);
            }
            Assert.True(polygons.Add(aoi.GetRawText()));
        }
        Assert.NotEmpty(polygons);
    }
}
