using DataCatalague.Api.Models.V1;
using DataCatalague.Api.PackageTypes;
using System.ComponentModel.DataAnnotations;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class WorkZoneArchiveTests
{
    private static string SampleDirectory => Path.Combine(AppContext.BaseDirectory, "Samples", "WorkZone");

    [Fact]
    public async Task Five_samples_preserve_metadata_summaries_and_every_polygon_ring() {
        var files = Directory.GetFiles(SampleDirectory, "*.zip").Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(5, files.Length);
        var references = new HashSet<string>();
        foreach (var file in files) {
            var source = ReadSample(file);
            var metadata = JsonNode.Parse(source["workzone.json"])!;
            await using var input = File.OpenRead(file);
            var zone = await WorkZoneArchive.ReadAsync(input, default);
            Assert.True(input.CanRead);
            Assert.Equal(metadata["title"]!.GetValue<string>(), zone.MetaData.Title);
            Assert.Equal("WorkZone", zone.MetaData.Source);
            Assert.Equal(metadata["caseNumber"]!.GetValue<string>(), zone.MetaData.RefId);
            Assert.Equal(metadata["caseId"]!.GetValue<string>(), zone.Manifest.CaseId);
            Assert.Equal(2, zone.Manifest.Documents!.Length);
            foreach (var document in zone.Manifest.Documents) {
                Assert.Contains(document.DocumentId, zone.Descriptions[0].Description);
                Assert.True(source.ContainsKey(document.File!));
                Assert.Contains("FICTIONAL", source[document.File!]);
            }
            Assert.True(references.Add(zone.MetaData.RefId!));
            Assert.Equal("WorkZone", zone.MetaData.Type);
            Assert.Null(zone.MetaData.ShortId);
            Assert.Null(zone.MetaData.CreatedUTC);
            Assert.Equal("en", Assert.Single(zone.Descriptions).Language);
            Assert.Contains(metadata["summary"]!.GetValue<string>(), zone.Descriptions[0].Description);
            var geometry = JsonNode.Parse(source["aoi.geojson"])!;
            if (geometry["type"]!.GetValue<string>() == "FeatureCollection") { geometry = geometry["features"]![0]!; }
            if (geometry["type"]!.GetValue<string>() == "Feature") { geometry = geometry["geometry"]!; }
            var polygons = geometry["type"]!.GetValue<string>() == "Polygon"
                ? new[] { geometry["coordinates"]! }
                : geometry["coordinates"]!.AsArray().Select(polygon => polygon!).ToArray();
            var sourceRings = polygons.SelectMany(polygon => polygon.AsArray()).ToArray();
            var detail = JsonNode.Parse(zone.Geometry.Surfaces!)!;
            var rings = detail["rings"]!.AsArray();
            Assert.Equal(sourceRings.Length, rings.Count);
            for (var i = 0; i < rings.Count; i++) {
                var expected = sourceRings[i]!.AsArray().Select(position => position!.ToJsonString()).Order().ToArray();
                var actual = rings[i]!.AsArray().Select(position => position!.ToJsonString()).Order().ToArray();
                Assert.Equal(expected, actual);
            }
            Assert.Equal(4326, detail["spatialReference"]!["wkid"]!.GetValue<int>());
            var aoi = JsonNode.Parse(zone.Geometry.Aoi)!;
            Assert.Equal(5, aoi["rings"]![0]!.AsArray().Count);
            var positions = sourceRings.SelectMany(ring => ring!.AsArray()).ToArray();
            Assert.Equal(positions.Min(point => point![0]!.GetValue<double>()), aoi["rings"]![0]![0]![0]!.GetValue<double>());
            Assert.Equal(positions.Max(point => point![1]!.GetValue<double>()), aoi["rings"]![0]![1]![1]!.GetValue<double>());
        }
    }

    [Fact]
    public async Task Summary_is_encoded_language_defaults_and_supporting_documents_are_allowed() {
        var files = ReadSample();
        var metadata = JsonNode.Parse(files["workzone.json"])!;
        metadata["summary"] = "Work <script>alert('x')</script> & equipment\nSecond line";
        metadata.AsObject().Remove("language");
        metadata["additionalField"] = "Retained in original ZIP";
        metadata["documents"]!.AsArray().Add(new JsonObject { ["documentId"] = "sample-extra", ["title"] = "Permit <draft>", ["file"] = "documents/permit.pdf" });
        files["workzone.json"] = metadata.ToJsonString();
        files["documents/permit.pdf"] = "%PDF-1.4\n%%EOF";
        using var input = Archive(files);
        var result = await WorkZoneArchive.ReadAsync(input, default);
        var description = Assert.Single(result.Descriptions);
        Assert.Equal("en", description.Language);
        Assert.DoesNotContain("<script>", description.Description);
        Assert.Contains("&lt;script&gt;", description.Description);
        Assert.Contains("&amp; equipment<br>Second line", description.Description);
        Assert.Contains("Permit &lt;draft&gt;", description.Description);
    }

    [Fact]
    public async Task Case_submission_can_contain_only_metadata_and_AOI_or_metadata_only_documents() {
        var files = ReadSample();
        foreach (var path in files.Keys.Where(path => path.StartsWith("documents/", StringComparison.Ordinal)).ToArray()) { files.Remove(path); }
        var metadata = JsonNode.Parse(files["workzone.json"])!;
        metadata.AsObject().Remove("caseId");
        metadata.AsObject().Remove("documents");
        files["workzone.json"] = metadata.ToJsonString();
        using var minimal = Archive(files);
        var submission = await WorkZoneArchive.ReadAsync(minimal, default);
        Assert.Null(submission.Manifest.Documents);
        Assert.Null(submission.Manifest.CaseId);
        metadata["documents"] = new JsonArray(new JsonObject { ["documentId"] = "source-record-1", ["title"] = "Registered document, content not included" });
        files["workzone.json"] = metadata.ToJsonString();
        using var metadataOnly = Archive(files);
        var withDocument = await WorkZoneArchive.ReadAsync(metadataOnly, default);
        Assert.Null(Assert.Single(withDocument.Manifest.Documents!).File);
        Assert.Contains("source-record-1", withDocument.Descriptions[0].Description);
    }

    [Theory]
    [InlineData("schemaVersion")]
    [InlineData("category")]
    [InlineData("title")]
    [InlineData("summary")]
    [InlineData("caseNumber")]
    public async Task Missing_or_blank_mandatory_metadata_is_rejected(string field) {
        foreach (var value in new string?[] { null, "", " " }) {
            var files = ReadSample();
            var metadata = JsonNode.Parse(files["workzone.json"])!;
            metadata[field] = value;
            files["workzone.json"] = metadata.ToJsonString();
            using var input = Archive(files);
            await Assert.ThrowsAsync<InvalidDataException>(() => WorkZoneArchive.ReadAsync(input, default));
        }
    }

    [Theory]
    [InlineData("missing-metadata")]
    [InlineData("missing-aoi")]
    [InlineData("wrong-category")]
    [InlineData("wrong-version")]
    [InlineData("extra-root-file")]
    [InlineData("unsafe-path")]
    [InlineData("duplicate-path")]
    [InlineData("non-polygon")]
    [InlineData("unclosed-ring")]
    [InlineData("zero-area")]
    [InlineData("out-of-range")]
    [InlineData("wrong-crs")]
    [InlineData("empty-collection")]
    [InlineData("multiple-features")]
    [InlineData("invalid-json")]
    [InlineData("empty-language")]
    [InlineData("missing-document")]
    [InlineData("undeclared-document")]
    [InlineData("duplicate-document-id")]
    [InlineData("duplicate-document-file")]
    [InlineData("missing-document-title")]
    [InlineData("unsafe-document-reference")]
    [InlineData("wrong-case-document-reference")]
    [InlineData("old-working-area-metadata")]
    public async Task Invalid_archives_fail_before_package_creation(string problem) {
        var files = ReadSample();
        var metadata = JsonNode.Parse(files["workzone.json"])!;
        var geometry = JsonNode.Parse(files["aoi.geojson"])!;
        switch (problem) {
            case "missing-metadata": files.Remove("workzone.json"); break;
            case "missing-aoi": files.Remove("aoi.geojson"); break;
            case "wrong-category": metadata["category"] = "MarineAggregateExtraction"; break;
            case "wrong-version": metadata["schemaVersion"] = "2.0"; break;
            case "empty-language": metadata["language"] = " "; break;
            case "missing-document": files.Remove(metadata["documents"]![0]!["file"]!.GetValue<string>()); break;
            case "undeclared-document": files["documents/extra.txt"] = "Undeclared content"; break;
            case "duplicate-document-id": metadata["documents"]![1]!["documentId"] = metadata["documents"]![0]!["documentId"]!.GetValue<string>(); break;
            case "duplicate-document-file": metadata["documents"]![1]!["file"] = metadata["documents"]![0]!["file"]!.GetValue<string>(); break;
            case "missing-document-title": metadata["documents"]![0]!["title"] = " "; break;
            case "unsafe-document-reference": metadata["documents"]![0]!["file"] = "documents/../secret.txt"; break;
            case "wrong-case-document-reference": metadata["documents"]![0]!["file"] = metadata["documents"]![0]!["file"]!.GetValue<string>().ToUpperInvariant(); break;
            case "old-working-area-metadata":
                metadata.AsObject().Remove("caseNumber");
                metadata["source"] = "Area submission";
                metadata["refId"] = "area-001";
                break;
            case "extra-root-file": files["extra.txt"] = "unsupported"; break;
            case "unsafe-path": files["documents/../escape.txt"] = "unsafe"; break;
            case "duplicate-path": files["AOI.GEOJSON"] = files["aoi.geojson"]; break;
            case "non-polygon": geometry = JsonNode.Parse("""{"type":"Point","coordinates":[12,55]}""")!; break;
            case "unclosed-ring": geometry["coordinates"]![0]!.AsArray().RemoveAt(0); break;
            case "zero-area": geometry["coordinates"] = JsonNode.Parse("[[[12,55],[13,55],[14,55],[12,55]]]"); break;
            case "out-of-range": geometry["coordinates"]![0]![1]![0] = 181; break;
            case "wrong-crs": geometry["crs"] = JsonNode.Parse("""{"type":"name","properties":{"name":"EPSG:25832"}}"""); break;
            case "empty-collection": geometry = JsonNode.Parse("""{"type":"FeatureCollection","features":[]}""")!; break;
            case "multiple-features":
                geometry = new JsonObject { ["type"] = "FeatureCollection", ["features"] = new JsonArray(
                    new JsonObject { ["type"] = "Feature", ["geometry"] = geometry.DeepClone() },
                    new JsonObject { ["type"] = "Feature", ["geometry"] = geometry.DeepClone() }) };
                break;
        }
        if (files.ContainsKey("workzone.json")) { files["workzone.json"] = metadata.ToJsonString(); }
        if (files.ContainsKey("aoi.geojson")) { files["aoi.geojson"] = problem == "invalid-json" ? "{" : geometry.ToJsonString(); }
        using var input = Archive(files);
        await Assert.ThrowsAsync<InvalidDataException>(() => WorkZoneArchive.ReadAsync(input, default));
    }

    [Fact]
    public async Task Size_limits_invalid_utf8_and_cancellation_are_enforced() {
        var files = ReadSample();
        files["aoi.geojson"] = new string(' ', 8 * 1024 * 1024 + 1);
        using var large = Archive(files);
        await Assert.ThrowsAsync<InvalidDataException>(() => WorkZoneArchive.ReadAsync(large, default));
        using var invalidUtf8 = Archive(ReadSample());
        using (var archive = new ZipArchive(invalidUtf8, ZipArchiveMode.Update, leaveOpen: true)) {
            archive.GetEntry("workzone.json")!.Delete();
            using var entry = archive.CreateEntry("workzone.json").Open();
            entry.Write([0xff, 0xfe]);
        }
        invalidUtf8.Position = 0;
        await Assert.ThrowsAsync<InvalidDataException>(() => WorkZoneArchive.ReadAsync(invalidUtf8, default));
        using var cancelled = Archive(ReadSample());
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => WorkZoneArchive.ReadAsync(cancelled, cancellation.Token));
    }

    [Fact]
    public async Task Symbolic_links_and_expanded_document_limits_are_rejected() {
        var files = ReadSample();
        files["documents/link.pdf"] = "target";
        using var symlink = Archive(files);
        using (var archive = new ZipArchive(symlink, ZipArchiveMode.Update, leaveOpen: true)) {
            archive.GetEntry("documents/link.pdf")!.ExternalAttributes = unchecked((int)0xa1ff0000);
        }
        symlink.Position = 0;
        await Assert.ThrowsAsync<InvalidDataException>(() => WorkZoneArchive.ReadAsync(symlink, default));
        using var expanded = Archive(ReadSample());
        using (var archive = new ZipArchive(expanded, ZipArchiveMode.Update, leaveOpen: true)) {
            using var entry = archive.CreateEntry("documents/oversized.txt").Open();
            var buffer = new byte[1024 * 1024];
            for (var i = 0; i <= 64; i++) { entry.Write(buffer); }
        }
        expanded.Position = 0;
        await Assert.ThrowsAsync<InvalidDataException>(() => WorkZoneArchive.ReadAsync(expanded, default));
    }

    [Fact]
    public void Archive_requests_use_the_existing_upload_URI_contract() {
        var valid = new CreatePackageRequest { Category = "WorkZone", AbsoluteUri = "database://b538a105-cb34-490c-9d2b-3603f1a7837b", ImportFromArchive = true };
        Assert.True(Validator.TryValidateObject(valid, new ValidationContext(valid), [], true));
        var conflicting = new CreatePackageRequest { Category = valid.Category, AbsoluteUri = valid.AbsoluteUri, ImportFromArchive = true, EsriJSON = "override" };
        Assert.False(Validator.TryValidateObject(conflicting, new ValidationContext(conflicting), [], true));
        var local = new CreatePackageRequest { Category = valid.Category, AbsoluteUri = "file:///C:/input.zip", ImportFromArchive = true };
        Assert.False(Validator.TryValidateObject(local, new ValidationContext(local), [], true));
    }

    private static Dictionary<string, string> ReadSample(string? file = null) {
        using var archive = ZipFile.OpenRead(file ?? Directory.GetFiles(SampleDirectory, "*.zip").Order(StringComparer.Ordinal).First());
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