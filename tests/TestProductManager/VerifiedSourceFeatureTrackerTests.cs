using S100FC.ProductCatalogue;
using S100FC.YAML;

namespace TestProductCatalogueAPI;

public sealed class VerifiedSourceFeatureTrackerTests
{
    private const string SourceUid = "{00000000-0000-0000-0000-0000000001AB}";
    private const string OtherUid = "{00000000-0000-0000-0000-0000000002CD}";

    [Fact]
    public void IncludedChangedFeatureIsNotReportedOutsideTheExportSelection()
    {
        var tracker = CreateTracker(SourceUid);

        Assert.True(tracker.RecordSelected(SourceUid.ToLowerInvariant()));
        tracker.RecordEmitted(SourceUid.ToLowerInvariant());

        var result = tracker.Complete();
        Assert.Equal(SourceUid, Assert.Single(result.Included));
        Assert.Empty(result.OutsideSelection);
        Assert.Empty(result.Collapsed);
    }

    [Fact]
    public void UnselectedChangedFeatureDoesNotCreateAnIncludedCandidate()
    {
        var tracker = CreateTracker(SourceUid);

        Assert.False(tracker.RecordSelected(OtherUid));

        var result = tracker.Complete();
        Assert.Empty(result.Included);
        Assert.Equal(SourceUid, Assert.Single(result.OutsideSelection));
        Assert.Empty(result.Collapsed);
    }

    [Fact]
    public void SelectedCollapsedFeatureIsNotReportedAsAnOmission()
    {
        var tracker = CreateTracker(SourceUid);

        Assert.True(tracker.RecordSelected(SourceUid));
        tracker.RecordCollapsed(SourceUid);

        var result = tracker.Complete();
        Assert.Empty(result.Included);
        Assert.Empty(result.OutsideSelection);
        Assert.Equal(SourceUid, Assert.Single(result.Collapsed));
    }

    [Fact]
    public void SelectedFeatureWithoutYamlEmissionFailsClosed()
    {
        var tracker = CreateTracker(SourceUid);
        Assert.True(tracker.RecordSelected(SourceUid));

        var error = Assert.Throws<InvalidOperationException>(() => { tracker.Complete(); });

        Assert.Contains("omitted", error.Message);
        Assert.Contains(SourceUid, error.Message);
        Assert.Contains("DPC preserved its watermark", error.Message);
    }

    [Fact]
    public void OmittedSelectedFeatureBlocksOtherSuccessfullyEmittedFeatures()
    {
        var tracker = CreateTracker(SourceUid, OtherUid);
        tracker.RecordSelected(SourceUid);
        tracker.RecordEmitted(SourceUid);
        tracker.RecordSelected(OtherUid);

        var error = Assert.Throws<InvalidOperationException>(() => { tracker.Complete(); });

        Assert.Contains(OtherUid, error.Message);
    }

    [Fact]
    public void SplitTopologyFeatureWithTwoEmittedPartsIncludesSourceOnlyOnce()
    {
        var tracker = CreateTracker(SourceUid);
        Assert.True(tracker.RecordSelected(SourceUid));
        var source = Guid.Parse(SourceUid).ToString("D");

        var mappings = TopologyFeatureMapping.Resolve(
            source,
            Primitive.Curve,
            new Dictionary<string, string> {
                [$"{source}:0"] = source,
                [$"{source}:1"] = source
            },
            new Dictionary<string, string> {
                [$"{source}:0"] = "C100",
                [$"{source}:1"] = "C101"
            },
            []);

        Assert.Equal(2, mappings.Count);
        foreach (var mapping in mappings)
        {
            Assert.StartsWith("C", mapping.Geometry);
            tracker.RecordEmitted(SourceUid);
        }

        var result = tracker.Complete();
        Assert.Equal(SourceUid, Assert.Single(result.Included));
    }

    [Fact]
    public void SelectedCurveWithNoUsableTopologyMappingFailsClosed()
    {
        var tracker = CreateTracker(SourceUid);
        Assert.True(tracker.RecordSelected(SourceUid));

        var mappings = TopologyFeatureMapping.Resolve(
            Guid.Parse(SourceUid).ToString("D"), Primitive.Curve,
            [], new Dictionary<string, string>(), []);

        Assert.Empty(mappings);
        Assert.Throws<InvalidOperationException>(() => { tracker.Complete(); });
    }

    [Fact]
    public void RecordingEmissionOrCollapseWithoutSelectionIsRejected()
    {
        var tracker = CreateTracker(SourceUid);

        Assert.Throws<InvalidOperationException>(() => tracker.RecordEmitted(SourceUid));
        Assert.Throws<InvalidOperationException>(() => tracker.RecordCollapsed(SourceUid));
    }

    [Fact]
    public void EmptyRequiredFeatureSetCompletesWithoutChanges()
    {
        var tracker = CreateTracker();

        var result = tracker.Complete();
        Assert.Empty(result.Included);
        Assert.Empty(result.OutsideSelection);
        Assert.Empty(result.Collapsed);
    }

    private static VerifiedSourceFeatureTracker CreateTracker(params string[] required) =>
        new("101DK0020157C", required);
}
