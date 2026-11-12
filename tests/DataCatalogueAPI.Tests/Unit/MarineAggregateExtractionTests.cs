using DataCatalague.Api.PackageTypes;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class MarineAggregateExtractionTests
{
    private const string SiteId = "b538a105-cb34-490c-9d2b-3603f1a7837b";
    private const string Fixture = """
        {"type":"FeatureCollection","features":[{"type":"Feature","id":"b538a105-cb34-490c-9d2b-3603f1a7837b",
          "properties":{"id":"b538a105-cb34-490c-9d2b-3603f1a7837b","number":"562-PA","name":"Thyborøn","type":"Builder",
            "expiryDate":"2024-05-02T22:00:00Z","Status":"Udløbet","remarks":"<script>alert(1)</script>","licenseUrl":"javascript:alert(1)"},
          "geometry":{"type":"MultiPolygon","coordinates":[
            [[[10,55],[12,55],[12,57],[10,57],[10,55]],[[10.5,55.5],[10.5,56],[11,56],[11,55.5],[10.5,55.5]]],
            [[[13,55],[14,55],[14,56],[13,56],[13,55]]]
          ]}}]}
        """;

    // Preserve each multipart shell and interior ring while converting GeoJSON to Esri winding.
    [Fact]
    public void Multipart_geometry_preserves_holes_and_uses_its_full_envelope() {
        var site = Assert.Single(MarineAggregateExtraction.Parse(Fixture));
        using var detail = JsonDocument.Parse(site.Geometry.Surfaces!);
        var rings = detail.RootElement.GetProperty("rings").EnumerateArray().ToArray();
        Assert.Equal(3, rings.Length);
        Assert.True(SignedArea(rings[0]) < 0);
        Assert.True(SignedArea(rings[1]) > 0);
        Assert.True(SignedArea(rings[2]) < 0);
        using var aoi = JsonDocument.Parse(site.Geometry.Aoi);
        var rectangle = aoi.RootElement.GetProperty("rings")[0];
        Assert.Equal(10, rectangle[0][0].GetDouble());
        Assert.Equal(55, rectangle[0][1].GetDouble());
        Assert.Equal(14, rectangle[2][0].GetDouble());
        Assert.Equal(57, rectangle[2][1].GetDouble());
        Assert.Equal(4326, detail.RootElement.GetProperty("spatialReference").GetProperty("wkid").GetInt32());
        Assert.Null(site.Geometry.Points);
        Assert.Null(site.Geometry.Curves);
    }

    // Source dates do not become creation dates; a source status must remain visibly historical.
    [Fact]
    public void Source_identity_and_expired_status_are_retained_and_external_HTML_is_encoded() {
        var site = Assert.Single(MarineAggregateExtraction.Parse(Fixture));
        Assert.Equal(SiteId, site.MetaData.RefId);
        Assert.Equal("562-PA – Thyborøn", site.MetaData.Title);
        Assert.Equal("Builder", site.MetaData.Type);
        Assert.Null(site.MetaData.ShortId);
        Assert.Null(site.MetaData.CreatedUTC);
        var description = Assert.Single(site.Descriptions);
        Assert.Equal("en", description.Language);
        var html = description.Description;
        Assert.Contains("<p><strong>Area number:</strong> 562-PA</p>", html);
        Assert.DoesNotContain("<dl", html);
        Assert.DoesNotContain("<dt", html);
        Assert.DoesNotContain("<dd", html);
        Assert.Contains("Status in supplied snapshot", html);
        Assert.Contains("2024-05-02T22:00:00", html);
        Assert.Contains("&lt;script&gt;", html);
        Assert.DoesNotContain("<script>", html);
        Assert.DoesNotContain("href=", html);
    }

    [Fact]
    public void Safe_permit_URL_is_available_as_a_link() {
        var snapshot = JsonNode.Parse(Fixture)!;
        snapshot["features"]![0]!["properties"]!["licenseUrl"] = "https://example.org/permit.pdf?a=1&b=2";
        var html = Assert.Single(MarineAggregateExtraction.Parse(snapshot.ToJsonString())).Descriptions[0].Description;
        Assert.Contains("href=\"https://example.org/permit.pdf?a=1&amp;b=2\"", html);
    }

    // Area numbers may repeat for subsites; the site UUID is the actual source identity.
    [Fact]
    public void Duplicate_source_UUIDs_are_rejected_before_import() {
        var snapshot = JsonNode.Parse(Fixture)!;
        var features = snapshot["features"]!.AsArray();
        features.Add(features[0]!.DeepClone());
        Assert.Throws<InvalidDataException>(() => MarineAggregateExtraction.Parse(snapshot.ToJsonString()));
    }

    [Theory]
    [InlineData("projected-crs")]
    [InlineData("empty")]
    [InlineData("unclosed")]
    [InlineData("outside-wgs84")]
    [InlineData("unsupported-type")]
    [InlineData("mismatched-id")]
    public void Invalid_source_data_is_rejected(string problem) {
        var snapshot = JsonNode.Parse(Fixture)!;
        var feature = snapshot["features"]![0]!;
        var geometry = feature["geometry"]!;
        switch (problem) {
            case "projected-crs": snapshot["crs"] = JsonNode.Parse("""{"type":"name","properties":{"name":"urn:ogc:def:crs:EPSG::25832"}}"""); break;
            case "empty": geometry["coordinates"] = new JsonArray(); break;
            case "unclosed": geometry["coordinates"]![0]![0]![0]![0] = 10.1; break;
            case "outside-wgs84": geometry["coordinates"]![0]![0]![0]![0] = 600000; break;
            case "unsupported-type": geometry["type"] = "Point"; break;
            case "mismatched-id": feature["id"] = Guid.Empty.ToString(); break;
        }
        Assert.Throws<InvalidDataException>(() => MarineAggregateExtraction.Parse(snapshot.ToJsonString()));
    }

    // Exercise every supplied record, including expired sites, holes and the multipart site.
    [Fact]
    public void Supplied_snapshot_contains_141_unique_sites_and_preserves_all_source_rings() {
        var file = Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction", "MARIS_Raastof_Live.geojson");
        var json = File.ReadAllText(file);
        var sites = MarineAggregateExtraction.Parse(json);
        Assert.Equal(141, sites.Count);
        Assert.Equal(141, sites.Select(site => site.MetaData.RefId).Distinct().Count());
        using var source = JsonDocument.Parse(json);
        var features = source.RootElement.GetProperty("features").EnumerateArray().ToArray();
        for (var i = 0; i < features.Length; i++) {
            var geometry = features[i].GetProperty("geometry");
            var coordinates = geometry.GetProperty("coordinates");
            var ringCount = geometry.GetProperty("type").GetString() == "Polygon" ? coordinates.GetArrayLength() : coordinates.EnumerateArray().Sum(polygon => polygon.GetArrayLength());
            using var output = JsonDocument.Parse(sites[i].Geometry.Surfaces!);
            Assert.Equal(ringCount, output.RootElement.GetProperty("rings").GetArrayLength());
            Assert.Equal(features[i].GetProperty("properties").GetProperty("id").GetString(), sites[i].MetaData.RefId);
        }
    }

    private static double SignedArea(JsonElement ring) {
        var points = ring.EnumerateArray().Select(point => new[] { point[0].GetDouble(), point[1].GetDouble() }).ToArray();
        return Enumerable.Range(0, points.Length - 1).Sum(i => points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1]);
    }
}
