using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class ArchiveBindingIndexTests
{
    private static readonly Guid TargetId = Guid.Parse("ab9b3e89-d57c-47c2-a105-68ebb574db10");
    private static DateTime Utc(int hour) => new(2026, 10, 29, hour, 0, 0, DateTimeKind.Utc);
    private static ArchiveBindingTarget Target(ArchiveBindingKind kind = ArchiveBindingKind.Information) => new(kind, TargetId);

    [Fact]
    public void UserInformationBindingFindsAnUnchangedSpatialOwnerOnceForEveryReferencedTarget() {
        var target = Target();
        var feature = Target(ArchiveBindingKind.Feature);
        var index = new ArchiveBindingIndex([target, feature], new(Utc(8), Utc(10)));
        var calls = 0;
        const string json = "[{\"association\":{\"code\":\"QualityOfBathymetricDataComposition\",\"attributes\":[]},\"roleType\":\"association\",\"role\":\"theQualityInformation\",\"informationType\":\"SpatialQuality\",\"informationId\":\"{ab9b3e89-d57c-47c2-a105-68ebb574db10}\"}]";
        index.AddOwner(new(Utc(6), null), json, "[{\"featureId\":\"AB9B3E89-D57C-47C2-A105-68EBB574DB10\",\"roleType\":\"aggregation\"}]", () => { calls++; return ["101DK001", "101DK002"]; });

        Assert.Equal(1, calls);
        Assert.Equal(2, index.Affected.Count);
        Assert.All(index.Affected.Values, targets => Assert.Equal(2, targets.Count));
        Assert.True(index.IsCurrent("101dk001", target));
        Assert.True(index.IsCurrent("101DK002", feature));
    }

    [Fact]
    public void HistoricalBindingSurvivesUnlinkOrOwnerDeletionButIsNotCurrent() {
        var target = Target();
        var index = new ArchiveBindingIndex([target], new(Utc(8), Utc(10)));
        index.AddOwner(new(Utc(6), Utc(9)), Json(target), null, () => ["OLD"]);
        index.AddOwner(new(Utc(9), null), "[]", null, () => throw new Exception("No matching target"));

        Assert.Equal(target, Assert.Single(index.Affected["OLD"]));
        Assert.False(index.IsCurrent("OLD", target));
    }

    [Fact]
    public void ChangedOwnersUseTheirOwnEndpointProductMembership() {
        var target = Target();
        var index = new ArchiveBindingIndex([target], new(Utc(8), Utc(10)));
        index.AddOwner(new(Utc(6), Utc(9)), Json(target), null, () => ["SCALE_1000"]);
        index.AddOwner(new(Utc(9), null), Json(target), null, () => ["SCALE_2000"]);

        Assert.Equal(2, index.Affected.Count);
        Assert.False(index.IsCurrent("SCALE_1000", target));
        Assert.True(index.IsCurrent("SCALE_2000", target));
    }

    [Fact]
    public void ReplayLowerBoundsUseDifferentOwnersAndDoNotReuseAnEarlierNetComparison() {
        var target = Target();
        var early = new ArchiveBindingIndex([target], new(Utc(8), Utc(14)));
        var replay = new ArchiveBindingIndex([target], new(Utc(10), Utc(14)));
        foreach (var index in new[] { early, replay }) {
            index.AddOwner(new(Utc(6), Utc(9)), Json(target), null, () => ["EARLY"]);
            index.AddOwner(new(Utc(9), Utc(13)), Json(target), null, () => ["REPLAY"]);
            index.AddOwner(new(Utc(13), null), Json(target), null, () => ["EARLY"]);
        }

        Assert.False(early.Affected.ContainsKey("REPLAY"));
        Assert.True(replay.Affected.ContainsKey("REPLAY"));
        Assert.False(replay.IsCurrent("REPLAY", target));
    }

    [Fact]
    public void TransientAndPostCutoffOwnersDoNotParseBindingsOrFetchGeometry() {
        var index = new ArchiveBindingIndex([Target()], new(Utc(8), Utc(12)));
        foreach (var interval in new[] { new ArchiveInterval(Utc(9), Utc(10)), new ArchiveInterval(Utc(13), null) })
            index.AddOwner(interval, "not JSON", null, () => throw new Exception("Outside endpoints"));
        Assert.Empty(index.Affected);
    }

    [Fact]
    public void UnrelatedBindingsAndEmptyArraysNeverFetchGeometry() {
        var index = new ArchiveBindingIndex([Target()], new(Utc(8), Utc(10)));
        index.AddOwner(new(Utc(6), null), "[]", "[]", () => throw new Exception("No target"));
        index.AddOwner(new(Utc(6), null), "[{\"informationId\":\"00000000-0000-0000-0000-000000000001\"}]", null, () => throw new Exception("Unrelated"));
        Assert.Empty(index.Affected);
    }

    [Fact]
    public void FeatureAssociationRoleIsSuppressedExactlyAsInTheExportPipeline() {
        var target = Target(ArchiveBindingKind.Feature);
        var index = new ArchiveBindingIndex([target], new(Utc(8), Utc(10)));
        index.AddOwner(new(Utc(6), null), Json(Target()), $"[{{\"featureId\":\"{TargetId:B}\",\"roleType\":\"association\"}}]", () => throw new Exception("Not exported"));
        Assert.Empty(index.Affected);
    }

    [Theory]
    [InlineData("not JSON")]
    [InlineData("{}")]
    [InlineData("[null]")]
    [InlineData("[{\"informationId\":\"invalid\"}]")]
    public void IncompleteBindingClassificationFailsClosed(string json) {
        var index = new ArchiveBindingIndex([Target()], new(Utc(8), Utc(10)));
        var error = Assert.Throws<InvalidOperationException>(() => index.AddOwner(new(Utc(6), null), json, null, () => []));
        Assert.Contains("watermark and candidates were preserved", error.Message);
    }

    [Fact]
    public void FractionalBoundariesExcludeOverselectedAndTransientOwnerVersions() {
        var target = Target();
        var index = new ArchiveBindingIndex([target], new(Utc(8).AddMilliseconds(500), Utc(10).AddMilliseconds(500)));
        index.AddOwner(new(Utc(8).AddMilliseconds(250), Utc(9)), Json(target), null, () => ["BEFORE"]);
        index.AddOwner(new(Utc(10).AddMilliseconds(750), null), Json(target), null, () => throw new Exception("SQL ceiling over-selected this row"));
        index.AddOwner(new(Utc(8).AddMilliseconds(750), Utc(9)), Json(target), null, () => throw new Exception("Neither endpoint"));
        Assert.Equal("BEFORE", Assert.Single(index.Affected.Keys));
        Assert.False(index.IsCurrent("BEFORE", target));
    }

    internal static string Json(ArchiveBindingTarget target) =>
        $"[{{\"{(target.Kind == ArchiveBindingKind.Information ? "informationId" : "featureId")}\":\"{target.Id:B}\",\"roleType\":\"aggregation\"}}]";
}
