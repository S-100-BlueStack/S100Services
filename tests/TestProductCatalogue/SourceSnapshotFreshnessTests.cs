using S100FC.ProductCatalogue;
using Xunit;

namespace TestProductCatalogueAPI;

/// <summary>Exercises first-read staleness, repeated changes and failure isolation without ArcGIS or live databases.</summary>
public sealed class SourceSnapshotFreshnessTests
{
    /// <summary>The original symptom must be rejected even when the source GlobalID is present in both reads.</summary>
    [Fact]
    public void MatchingGlobalIdWithOldNameIsRejected() {
        var read = Row("Atlantkaj");
        var current = read with { Attributes = "{\"featureName[0].name\":\"Atlantkaj 67\"}" };
        var exception = Assert.Throws<SourceSnapshotMismatchException>(() => SourceSnapshotFreshness.RequireMatch("101DK005ESBJG", read, current));
        Assert.Contains("attributebindings", exception.Message);
        Assert.DoesNotContain("Atlantkaj", exception.Message);
    }

    /// <summary>Verification compares live archive content rather than rejecting a legitimate later edit against the earlier scan cutoff.</summary>
    [Fact]
    public void NewerSourceAndLiveArchiveCanAgreeAfterTheScanCutoff() {
        var read = Row("Atlantkaj 76");
        var archive = read with { Attributes = "{ \"featureName[0].name\" : \"Atlantkaj 76\" }" };
        SourceSnapshotFreshness.RequireMatch("101DK005ESBJG", read, archive);
    }

    /// <summary>Association edits require the same freshness guarantee as direct attribute edits.</summary>
    [Fact]
    public void StaleAssociationAndMissingArchiveAreRejected() {
        var read = Row("name");
        Assert.Throws<SourceSnapshotMismatchException>(() => SourceSnapshotFreshness.RequireMatch("dataset", read, null));
        Assert.Throws<SourceSnapshotMismatchException>(() => SourceSnapshotFreshness.RequireMatch("dataset", read, read with { InformationBindings = "[{\"informationId\":\"new\"}]" }));
        Assert.Throws<SourceSnapshotMismatchException>(() => SourceSnapshotFreshness.RequireMatch("dataset", read, read with { FeatureBindings = "[{\"featureId\":\"new\"}]" }));
        Assert.Throws<SourceSnapshotMismatchException>(() => SourceSnapshotFreshness.RequireMatch("dataset", read, read with { Id = Guid.NewGuid() }));
    }

    /// <summary>Equivalent JSON object order must not turn a valid export into a source failure.</summary>
    [Fact]
    public void PropertyOrderAndOptionalNullBindingsAreEquivalent() {
        var read = Row("name") with { Attributes = "{\"a\":1,\"b\":2}", InformationBindings = null };
        SourceSnapshotFreshness.RequireMatch("dataset", read, read with { Attributes = "{\"b\":2,\"a\":1}", InformationBindings = " " });
    }

    /// <summary>A malformed payload fails without exposing its values in the public exception chain.</summary>
    [Fact]
    public void InvalidJsonDoesNotExposePayloadOrEnterRefreshRetry() {
        var read = Row("name") with { Attributes = "secret-payload-is-not-json" };
        var exception = Assert.Throws<InvalidDataException>(() => SourceSnapshotFreshness.RequireMatch("dataset", read, read));
        Assert.DoesNotContain("secret-payload", exception.ToString());
    }

    /// <summary>A stale first read is discarded and only the subsequent verified snapshot reaches the caller.</summary>
    [Fact]
    public async Task StaleFirstSnapshotIsRebuiltOnce() {
        var attempts = 0;
        var retries = 0;
        var archive = Row("Atlantkaj 67");
        var result = await SourceSnapshotFreshness.ReadWithRetryAsync(_ => {
            var read = ++attempts == 1 ? Row("Atlantkaj") : archive;
            SourceSnapshotFreshness.RequireMatch("dataset", read, archive);
            return Task.FromResult(read);
        }, _ => retries++, default);
        Assert.Equal(archive, result);
        Assert.Equal(2, attempts);
        Assert.Equal(1, retries);
    }

    /// <summary>Persistent disagreement stops after two attempts instead of looping or accepting stale content.</summary>
    [Fact]
    public async Task PersistentMismatchFailsAfterOneRetry() {
        var attempts = 0;
        await Assert.ThrowsAsync<SourceSnapshotMismatchException>(() => SourceSnapshotFreshness.ReadWithRetryAsync<int>(_ => {
            attempts++;
            throw new SourceSnapshotMismatchException("dataset", Row("name"), "attributebindings");
        }, _ => { }, default));
        Assert.Equal(2, attempts);
    }

    /// <summary>Cancellation during retry notification prevents a second native read.</summary>
    [Fact]
    public async Task CancellationPreventsRetry() {
        using var cancellation = new CancellationTokenSource();
        var attempts = 0;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => SourceSnapshotFreshness.ReadWithRetryAsync<int>(_ => {
            attempts++;
            throw new SourceSnapshotMismatchException("dataset", Row("name"), "attributebindings");
        }, _ => cancellation.Cancel(), cancellation.Token));
        Assert.Equal(1, attempts);
    }

    /// <summary>General source failures keep existing failure handling and are not retried as if they were stale reads.</summary>
    [Fact]
    public async Task UnrelatedFailureIsNotRetried() {
        var attempts = 0;
        await Assert.ThrowsAsync<InvalidDataException>(() => SourceSnapshotFreshness.ReadWithRetryAsync<int>(_ => {
            attempts++;
            throw new InvalidDataException("invalid source");
        }, _ => throw new InvalidOperationException("Retry must not run."), default));
        Assert.Equal(1, attempts);
    }

    /// <summary>Creates a managed fixture representing the same persistent source feature across versions.</summary>
    /// <param name="name">Feature name to encode as flattened JSON.</param>
    /// <returns>A source row with deterministic identity and empty associations.</returns>
    private static SourceSnapshotAttributes Row(string name) => new("curve", Guid.Parse("0dbd5b47-6b01-448f-b624-176ad20470cf"),
        "ShorelineConstruction", System.Text.Json.JsonSerializer.Serialize(new Dictionary<string, string> { ["featureName[0].name"] = name }), "[]", "[]");
}
