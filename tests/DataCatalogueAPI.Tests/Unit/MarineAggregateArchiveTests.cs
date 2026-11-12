using DataCatalague.Api.Models.V1;
using DataCatalague.Api.PackageTypes;
using System.ComponentModel.DataAnnotations;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class MarineAggregateArchiveTests
{
    private static string SampleFile => Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction"), "*.zip").Order(StringComparer.Ordinal).First();

    [Fact]
    public async Task All_ten_samples_are_single_site_archives_preserving_source_properties() {
        var files = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction"), "*.zip").Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(10, files.Length);
        var ids = new HashSet<string>();
        var sourceFile = Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction", "MARIS_Raastof_Live.geojson");
        var sourceFeatures = JsonNode.Parse(await File.ReadAllTextAsync(sourceFile))!["features"]!.AsArray().Take(10).ToArray();
        for (var i = 0; i < files.Length; i++) {
            await using var input = File.OpenRead(files[i]);
            var parsed = await MarineAggregateArchive.ReadAsync(input, default);
            Assert.Equal("1.0", parsed.Manifest.SchemaVersion);
            Assert.Null(parsed.Manifest.RetrievedAtUtc);
            Assert.True(ids.Add(parsed.Site.MetaData.RefId!));
            Assert.Null(parsed.Site.MetaData.CreatedUTC);
            Assert.NotNull(parsed.Site.Geometry.Surfaces);
            var description = Assert.Single(parsed.Site.Descriptions);
            Assert.Equal("en", description.Language);
            Assert.Contains("Area number:", description.Description);
            Assert.Contains("Submission source:", description.Description);
            Assert.Contains("Unknown", description.Description);
            Assert.True(input.CanRead);
            using var archive = ZipFile.OpenRead(files[i]);
            using var text = new StreamReader(archive.GetEntry("areas.geojson")!.Open());
            var feature = JsonNode.Parse(await text.ReadToEndAsync())!["features"]![0];
            Assert.True(JsonNode.DeepEquals(sourceFeatures[i], feature));
        }
    }

    [Fact]
    public async Task Referenced_PDF_and_actual_UTC_retrieval_time_are_preserved() {
        var files = ReadSample();
        var manifest = JsonNode.Parse(files["manifest.json"])!;
        manifest["retrievedAtUtc"] = "2026-11-04T12:00:00Z";
        manifest["documents"] = new JsonArray("documents/permit.pdf");
        files["manifest.json"] = manifest.ToJsonString();
        files["documents/permit.pdf"] = "%PDF-1.4\n%%EOF";
        using var input = Archive(files);
        var result = await MarineAggregateArchive.ReadAsync(input, default);
        Assert.Equal(new DateTimeOffset(2026, 11, 4, 12, 0, 0, TimeSpan.Zero), result.Manifest.RetrievedAtUtc);
        var description = Assert.Single(result.Site.Descriptions);
        Assert.Contains("Area number:", description.Description);
        Assert.Contains("2026-11-04T12:00:00", description.Description);
        Assert.Contains("documents/permit.pdf", description.Description);
    }

    [Theory]
    [InlineData("missing-manifest")]
    [InlineData("missing-geojson")]
    [InlineData("wrong-category")]
    [InlineData("wrong-version")]
    [InlineData("missing-document")]
    [InlineData("undeclared-file")]
    [InlineData("unsafe-entry")]
    [InlineData("duplicate-entry")]
    [InlineData("batch")]
    [InlineData("unknown-retrieval-offset")]
    [InlineData("non-utc-retrieval")]
    public async Task Invalid_archive_contracts_are_rejected(string problem) {
        var files = ReadSample();
        var manifest = JsonNode.Parse(files["manifest.json"])!;
        switch (problem) {
            case "missing-manifest": files.Remove("manifest.json"); break;
            case "missing-geojson": files.Remove("areas.geojson"); break;
            case "wrong-category": manifest["category"] = "GeneralSubmission"; break;
            case "wrong-version": manifest["schemaVersion"] = "2.0"; break;
            case "missing-document": manifest["documents"] = new JsonArray("documents/missing.pdf"); break;
            case "undeclared-file": files["other.json"] = "{}"; break;
            case "unsafe-entry": files["../escape.pdf"] = "unsafe"; break;
            case "duplicate-entry": files["AREAS.GEOJSON"] = files["areas.geojson"]; break;
            case "batch":
                var geoJson = JsonNode.Parse(files["areas.geojson"])!;
                var features = geoJson["features"]!.AsArray();
                var next = features[0]!.DeepClone();
                var id = Guid.NewGuid().ToString();
                next["id"] = id;
                next["properties"]!["id"] = id;
                features.Add(next);
                files["areas.geojson"] = geoJson.ToJsonString();
                break;
            case "unknown-retrieval-offset": manifest["retrievedAtUtc"] = "2026-11-04T12:00:00"; break;
            case "non-utc-retrieval": manifest["retrievedAtUtc"] = "2026-11-04T12:00:00+01:00"; break;
        }
        if (files.ContainsKey("manifest.json")) { files["manifest.json"] = manifest.ToJsonString(); }
        using var input = Archive(files);
        await Assert.ThrowsAsync<InvalidDataException>(() => MarineAggregateArchive.ReadAsync(input, default));
    }

    [Fact]
    public async Task Inflated_size_limits_and_cancellation_are_enforced() {
        var files = ReadSample();
        files["areas.geojson"] = new string(' ', 8 * 1024 * 1024 + 1);
        using var large = Archive(files);
        await Assert.ThrowsAsync<InvalidDataException>(() => MarineAggregateArchive.ReadAsync(large, default));
        using var cancelled = Archive(ReadSample());
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => MarineAggregateArchive.ReadAsync(cancelled, cancellation.Token));
    }

    [Theory]
    [InlineData("database://b538a105-cb34-490c-9d2b-3603f1a7837b", true, false, true)]
    [InlineData("database://b538a105-cb34-490c-9d2b-3603f1a7837b/", true, false, true)]
    [InlineData("database://b538a105-cb34-490c-9d2b-3603f1a7837b/areas.geojson", true, false, false)]
    [InlineData("database://b538a105-cb34-490c-9d2b-3603f1a7837b?extra=1", true, false, false)]
    [InlineData("database://b538a105-cb34-490c-9d2b-3603f1a7837b#extra", true, false, false)]
    [InlineData("file:///C:/private/input.zip", true, false, false)]
    [InlineData("https://example.org/input.zip", true, false, false)]
    [InlineData("database://not-a-uuid", true, false, false)]
    [InlineData("database://b538a105-cb34-490c-9d2b-3603f1a7837b", true, true, false)]
    [InlineData("https://example.org/input.zip", false, true, true)]
    [InlineData("https://example.org/input.zip", false, false, false)]
    public void Creation_requires_an_upload_URI_or_explicit_geometry_without_conflicting_sources(string uri, bool import, bool geometry, bool expected) {
        var request = new CreatePackageRequest { Category = "MarineAggregateExtraction", AbsoluteUri = uri, ImportFromArchive = import, EsriJSON = geometry ? "provided" : null };
        Assert.Equal(expected, Validator.TryValidateObject(request, new ValidationContext(request), new List<ValidationResult>(), validateAllProperties: true));
    }

    private static Dictionary<string, string> ReadSample() {
        using var archive = ZipFile.OpenRead(SampleFile);
        return archive.Entries.ToDictionary(entry => entry.FullName, entry => {
            using var reader = new StreamReader(entry.Open());
            return reader.ReadToEnd();
        }, StringComparer.Ordinal);
    }

    private static MemoryStream Archive(Dictionary<string, string> files) {
        var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true)) {
            foreach (var file in files) {
                using var writer = new StreamWriter(archive.CreateEntry(file.Key).Open(), new UTF8Encoding(false));
                writer.Write(file.Value);
            }
        }
        output.Position = 0;
        return output;
    }
}
