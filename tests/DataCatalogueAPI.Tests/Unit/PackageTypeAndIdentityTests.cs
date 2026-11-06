using DataCatalague.Api;
using DataCatalague.Api.Domain;
using DataCatalague.Api.PackageTypes;
using DataCatalague.Api.Services;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class PackageTypeAndIdentityTests
{
    // Construct the GeneralSubmission package type from existing domain objects.
    // Expected: Metadata, geometry and descriptions are preserved without copying or extra fields.
    [Fact]
    public void GeneralSubmission_uses_existing_metadata_geometry_and_descriptions() {
        var metadata = new PackageMetaData(null, "GeneralSubmission", "Title", "Source", null, null);
        var geometry = new PackageGeometry("aoi", null, null, "surface");
        var descriptions = new[] { new PackageDescription(null, "Description") };
        var submission = new GeneralSubmission(metadata, geometry, descriptions);
        Assert.Same(metadata, submission.MetaData);
        Assert.Same(geometry, submission.Geometry);
        Assert.Same(descriptions, submission.Descriptions);
    }

    // Parse a real NoticeToMariners JSON fixture.
    // Expected: The notice has an ID, an NM short ID, an explicit spatial reference and detail geometry.
    [Fact]
    public void Notice_parser_reads_real_sample_metadata_and_full_geometry() {
        var file = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "NoticesToMariners"), "*.json").Order().First();
        var notice = NoticeToMariners.Parse(File.ReadAllText(file));
        Assert.False(string.IsNullOrWhiteSpace(notice.Id));
        Assert.StartsWith("NM-", notice.MetaData.ShortId);
        Assert.Contains("spatialReference", notice.Geometry.Aoi);
        Assert.True(notice.Geometry.Points is not null || notice.Geometry.Curves is not null || notice.Geometry.Surfaces is not null);
    }

    // Reserve package IDs across two years, reject a duplicate and release its reservation.
    // Expected: Each year starts at GS-000-YY; released short IDs can be reserved again.
    [Fact]
    public void Identity_numbers_include_year_and_release_failed_reservations() {
        var identities = new PackageIdentityService();
        var first = identities.Reserve("GS", null, new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero))!.Value;
        var nextYear = identities.Reserve("GS", null, new DateTimeOffset(2027, 1, 1, 0, 0, 0, TimeSpan.Zero))!.Value;
        Assert.Equal("GS-000-26", first.ShortId);
        Assert.Equal("GS-000-27", nextYear.ShortId);
        Assert.NotEqual(first.Id, nextYear.Id);
        Assert.Null(identities.Reserve("GS", first.ShortId, DateTimeOffset.UtcNow));
        identities.Release(first.ShortId);
        Assert.NotNull(identities.Reserve("GS", first.ShortId, DateTimeOffset.UtcNow));
    }

    // Reserve 100 package identities concurrently through one identity service.
    // Expected: All 100 package IDs and all 100 short IDs are unique.
    [Fact]
    public async Task Concurrent_identity_reservations_are_unique() {
        var identities = new PackageIdentityService();
        var reserved = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => Task.Run(() => identities.Reserve("GS", null, DateTimeOffset.UtcNow)!.Value)));
        Assert.Equal(100, reserved.Select(identity => identity.Id).Distinct().Count());
        Assert.Equal(100, reserved.Select(identity => identity.ShortId).Distinct().Count());
    }

    // Normalize usernames with domain prefixes, mixed casing and surrounding whitespace.
    // Expected: Each supplied username matches the lowercase, domain-free expected value.
    [Theory]
    [InlineData("PROD\\Alice", "alice")]
    [InlineData(" prod\\BOB ", "bob")]
    [InlineData("carol", "carol")]
    public void Usernames_are_normalized(string supplied, string expected) {
        Assert.Equal(expected, Extensions.NormalizeUserName(supplied));
    }
}
