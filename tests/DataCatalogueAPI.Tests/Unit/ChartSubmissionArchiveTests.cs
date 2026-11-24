using DataCatalague.Api.PackageTypes;
using System.IO.Compression;
using System.Text.Json;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class ChartSubmissionArchiveTests
{
    [Theory]
    [InlineData("ENC", "ENC-000-26", false, false, true)]
    [InlineData("Landdata", "LD-000-26", false, false, true)]
    [InlineData("CoastAndRock", "CR-000-26", true, true, false)]
    public async Task Sample_archives_supply_metadata_and_complete_geometry(string category, string shortId, bool points, bool curves, bool surfaces) {
        var path = Path.Combine(AppContext.BaseDirectory, "Samples", "ChartSubmissions", category, shortId + ".zip");
        await using var input = File.OpenRead(path);
        var result = await ChartSubmissionArchive.ReadAsync(category, input, default);

        Assert.Equal(shortId, result.MetaData.ShortId);
        Assert.Equal(category, result.MetaData.Type);
        Assert.Equal(TimeSpan.Zero, result.MetaData.CreatedUTC!.Value.Offset);
        Assert.Equal("en", Assert.Single(result.Descriptions!).Language);
        Assert.Equal(points, result.Geometry.Points is not null);
        Assert.Equal(curves, result.Geometry.Curves is not null);
        Assert.Equal(surfaces, result.Geometry.Surfaces is not null);
        using var aoi = JsonDocument.Parse(result.Geometry.Aoi);
        Assert.Equal(4326, aoi.RootElement.GetProperty("spatialReference").GetProperty("wkid").GetInt32());
        Assert.Equal(5, aoi.RootElement.GetProperty("rings")[0].GetArrayLength());
    }

    [Theory]
    [InlineData("chart.000")]
    [InlineData("report.vld")]
    public async Task Enc_rejects_a_missing_dataset_or_report(string suppliedFile) {
        using var input = Zip(("metadata.json", """{"title":"Test","source":"Fixture"}"""), (suppliedFile, "test"));
        await Assert.ThrowsAsync<InvalidDataException>(() => ChartSubmissionArchive.ReadAsync("ENC", input, default));
    }

    [Fact]
    public async Task GeoJson_with_projected_coordinates_or_unsafe_paths_is_rejected() {
        const string metadata = """{"title":"Test","source":"Fixture"}""";
        using var projected = Zip(("metadata.json", metadata), ("point.geojson", """{"type":"Point","coordinates":[12,55],"crs":{"type":"name","properties":{"name":"EPSG:25832"}}}"""));
        using var unsafePath = Zip(("metadata.json", metadata), ("../point.geojson", """{"type":"Point","coordinates":[12,55]}"""));
        await Assert.ThrowsAsync<InvalidDataException>(() => ChartSubmissionArchive.ReadAsync("Landdata", projected, default));
        await Assert.ThrowsAsync<InvalidDataException>(() => ChartSubmissionArchive.ReadAsync("CoastAndRock", unsafePath, default));
    }

    private static MemoryStream Zip(params (string Name, string Content)[] files) {
        var buffer = new MemoryStream();
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true)) {
            foreach (var file in files) {
                using var writer = new StreamWriter(archive.CreateEntry(file.Name).Open());
                writer.Write(file.Content);
            }
        }
        buffer.Position = 0;
        return buffer;
    }
}
