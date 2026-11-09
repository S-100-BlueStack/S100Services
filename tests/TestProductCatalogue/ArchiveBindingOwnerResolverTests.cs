using S100FC.ProductCatalogue;
using Xunit;

namespace TestProductCatalogueAPI;

/// <summary>Exercises the streaming owner resolver without ArcGIS, including repeated unavailable IDs and recycling-cursor lifetimes.</summary>
public sealed class ArchiveBindingOwnerResolverTests
{
    private static readonly ArchiveBindingTarget Information = new(ArchiveBindingKind.Information, Guid.Parse("10000000-0000-0000-0000-000000000001"));
    private static readonly ArchiveBindingTarget Feature = new(ArchiveBindingKind.Feature, Guid.Parse("20000000-0000-0000-0000-000000000001"));

    /// <summary>Historical and current versions sharing a feature identity and SDK ObjectID -1 must both contribute their own product matches.</summary>
    [Fact]
    public void RepeatedUnavailableObjectIdsAndSharedFeatureGuidKeepEveryVersion() {
        var sameFeature = Guid.Parse("30000000-0000-0000-0000-000000000001");
        var rows = new[] { (ObjectId: -1L, FeatureId: sameFeature, Interval: new ArchiveInterval(Utc(6), Utc(9)), Product: "OLD"),
            (ObjectId: -1L, FeatureId: sameFeature, Interval: new ArchiveInterval(Utc(9), null), Product: "CURRENT") };
        var currentPosition = -1;
        var matches = 0;
        var disposed = false;
        IEnumerable<ArchiveBindingOwner> Owners() {
            try {
                for (var i = 0; i < rows.Length; i++) {
                    currentPosition = i;
                    var position = i;
                    yield return new(rows[i].Interval, Json(Information), Json(Feature), () => {
                        // A deferred callback would observe a different native row after MoveNext.
                        Assert.Equal(position, currentPosition);
                        matches++;
                        return [rows[currentPosition].Product];
                    }, "isolated cursor");
                }
            }
            finally { disposed = true; }
        }
        var index = new ArchiveBindingIndex([Information, Feature], new(Utc(8), Utc(10)));
        Assert.Equal(2, ArchiveBindingOwnerResolver.Resolve(index, Owners(), default));
        Assert.Equal(2, matches);
        Assert.Equal(2, index.Affected["OLD"].Count);
        Assert.Equal(2, index.Affected["CURRENT"].Count);
        Assert.False(index.IsCurrent("OLD", Information));
        Assert.True(index.IsCurrent("CURRENT", Information));
        Assert.True(index.IsCurrent("CURRENT", Feature));
        Assert.True(disposed);
    }

    /// <summary>A matching owner's geometry is resolved once even when multiple changed targets or repeated bindings refer to it.</summary>
    [Fact]
    public void AllTargetsOnOneOwnerShareOneImmediateSpatialMatch() {
        var calls = 0;
        var index = new ArchiveBindingIndex([Information, Feature], new(Utc(8), Utc(10)));
        var owner = new ArchiveBindingOwner(new(Utc(6), null), Json(Information), Json(Feature), () => { calls++; return ["A", "B"]; }, "isolated cursor");
        ArchiveBindingOwnerResolver.Resolve(index, [owner], default);
        Assert.Equal(1, calls);
        Assert.Equal(2, index.Affected.Count);
        Assert.Equal(2, index.Affected["A"].Count);
        Assert.True(index.IsCurrent("B", Information));
    }

    /// <summary>The retained-history path includes intermediate endpoint owners and receives managed matches, never delayed row callbacks.</summary>
    [Fact]
    public void ReusableHistoryRetainsIntermediateVersionWithoutObjectIdentity() {
        var index = new ArchiveBindingIndex([Information], new(Utc(8), Utc(12)));
        var retained = new List<(ArchiveInterval Interval, IReadOnlyCollection<ArchiveBindingTarget> Targets, IReadOnlyList<string> Products)>();
        var owner = new ArchiveBindingOwner(new(Utc(9), Utc(11)), Json(Information), null, () => ["INTERMEDIATE"], "isolated cursor");
        var count = ArchiveBindingOwnerResolver.Resolve(index, [owner], default,
            (interval, targets, products) => retained.Add((interval, targets, products)), [Utc(8), Utc(10), Utc(12)]);
        Assert.Equal(1, count);
        Assert.Single(retained);
        Assert.Equal("INTERMEDIATE", retained[0].Products[0]);
        Assert.Contains(Information, retained[0].Targets);
        Assert.Empty(index.Affected);
    }

    /// <summary>Unrelated or irrelevant versions must not require valid geometry, scale or binding JSON.</summary>
    [Fact]
    public void UnrelatedAndOutsideEndpointOwnersDoNotMatchGeometry() {
        var index = new ArchiveBindingIndex([Information], new(Utc(8), Utc(12)));
        var owners = new[] {
            new ArchiveBindingOwner(new(Utc(6), null), "[]", null, () => throw new Exception("Unreferenced geometry"), "unreferenced"),
            new ArchiveBindingOwner(new(Utc(9), Utc(10)), "not JSON", null, () => throw new Exception("Intermediate geometry"), "outside exact endpoints")
        };
        Assert.Equal(0, ArchiveBindingOwnerResolver.Resolve(index, owners, default));
        Assert.Equal(0, ArchiveBindingOwnerResolver.Resolve(index, owners, default, (_, _, _) => throw new Exception("Must not retain"), [Utc(8), Utc(12)]));
        Assert.Empty(index.Affected);
    }

    /// <summary>A classification failure disposes the iterator and retains the fail-closed diagnostic boundary.</summary>
    [Fact]
    public void MalformedRelevantBindingsFailAndDisposeTheCursorEnumeration() {
        var disposed = false;
        IEnumerable<ArchiveBindingOwner> Owners() {
            try { yield return new(new(Utc(6), null), "not JSON", null, () => throw new Exception("Must not match"), "isolated class and row"); }
            finally { disposed = true; }
        }
        var index = new ArchiveBindingIndex([Information], new(Utc(8), Utc(10)));
        var error = Assert.Throws<InvalidOperationException>(() => ArchiveBindingOwnerResolver.Resolve(index, Owners(), default));
        Assert.Contains("watermark and candidates were preserved", error.Message);
        Assert.Contains("isolated class and row", error.Message);
        Assert.True(disposed);
        Assert.Empty(index.Affected);
    }

    /// <summary>Cancellation stops owner matching and releases an in-progress cursor enumeration.</summary>
    [Fact]
    public void CancellationBetweenOwnersDisposesTheEnumeration() {
        using var cancellation = new CancellationTokenSource();
        var matched = 0;
        var disposed = false;
        IEnumerable<ArchiveBindingOwner> Owners() {
            try {
                for (var i = 0; i < 3; i++)
                    yield return new(new(Utc(6), null), Json(Information), null, () => { matched++; cancellation.Cancel(); return ["A"]; }, "isolated cursor");
            }
            finally { disposed = true; }
        }
        var index = new ArchiveBindingIndex([Information], new(Utc(8), Utc(10)));
        Assert.Throws<OperationCanceledException>(() => ArchiveBindingOwnerResolver.Resolve(index, Owners(), cancellation.Token));
        Assert.Equal(1, matched);
        Assert.True(disposed);
    }

    /// <summary>Uses stable UTC instants for all owner lifetimes and scan boundaries.</summary>
    private static DateTime Utc(int hour) => new(2026, 11, 9, hour, 0, 0, DateTimeKind.Utc);

    /// <summary>Produces representative incoming bindings for either supported target namespace.</summary>
    private static string Json(ArchiveBindingTarget target) =>
        $"[{{\"{(target.Kind == ArchiveBindingKind.Information ? "informationId" : "featureId")}\":\"{target.Id:B}\",\"roleType\":\"aggregation\"}}]";
}
