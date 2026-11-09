using S100FC.ProductCatalogue;
using System.Text.Json;
using Xunit;
using History = S100FC.ProductCatalogue.ProductManagerGDB.ArchiveHistory;
using Version = S100FC.ProductCatalogue.ProductManagerGDB.ArchiveVersion;
using Owner = S100FC.ProductCatalogue.ProductManagerGDB.ArchiveOwner;

namespace TestProductCatalogueAPI;

/// <summary>Compares reusable source history with the original per-window membership and endpoint algorithm, without live stores.</summary>
public sealed class DpcArchiveHistoryTests
{
    /// <summary>An earlier net-zero result cannot hide a real difference against a later package boundary.</summary>
    [Fact]
    public void RevertIsRecomposedForEachExactBoundary() {
        var versions = new Dictionary<string, List<Version>> {
            ["feature"] = [Row(0, 0, 2, "A"), Row(1, 2, 4, "A"), Row(0, 4, null, "A")]
        };
        var history = new History(new(Utc(1), Utc(6)));
        history.Seal(versions, []);
        var early = history.Compose(new(Utc(1), Utc(6)), "A", default)["feature"];
        var later = history.Compose(new(Utc(3), Utc(6)), "A", default)["feature"];
        Assert.Equal(early.BeforeAttributeBindings, early.AttributeBindings);
        Assert.NotEqual(later.BeforeAttributeBindings, later.AttributeBindings);
        later.AttributeBindings = "mutated result";
        Assert.Equal("{\"value\":0}", history.Compose(new(Utc(3), Utc(6)), "A", default)["feature"].AttributeBindings);
    }

    /// <summary>Owners existing only at an intermediate comparison boundary must survive the broad history read.</summary>
    [Fact]
    public void IntermediateIncomingOwnerIsRetainedForBothBindingKinds() {
        foreach (var kind in new[] { ArchiveBindingKind.Feature, ArchiveBindingKind.Information }) {
            var target = new ArchiveBindingTarget(kind, new Guid(1, 0, 0, new byte[8]));
            var history = new History(new(Utc(1), Utc(6)));
            history.Owners.Add(new(new(Utc(2), Utc(4)), [target], ["A"]));
            history.Seal(new() { [target.SourceId] = [Row(0, 0, 5), Row(1, 5, null)] }, [target]);
            Assert.Empty(history.Compose(new(Utc(1), Utc(6)), "A", default));
            var change = history.Compose(new(Utc(3), Utc(6)), "A", default)[target.SourceId];
            Assert.False(change.CurrentInProduct);
            Assert.False(change.Deleted);
            var index = new ArchiveBindingIndex([target], new(Utc(1), Utc(6)));
            var json = JsonSerializer.Serialize(new[] { new Dictionary<string, string> { [kind == ArchiveBindingKind.Feature ? "featureId" : "informationId"] = target.Id.ToString() } });
            Assert.Empty(index.FindTargets(new(Utc(2), Utc(4)), kind == ArchiveBindingKind.Information ? json : null, kind == ArchiveBindingKind.Feature ? json : null));
            Assert.Single(index.FindTargets(new(Utc(2), Utc(4)), kind == ArchiveBindingKind.Information ? json : null, kind == ArchiveBindingKind.Feature ? json : null, includeIntermediate: true));
        }
    }

    /// <summary>Source selection changes and deletions keep their original historical/current membership distinctions.</summary>
    [Fact]
    public void ScaleMovesAndDeletionsKeepTheirEndpointMembership() {
        var history = new History(new(Utc(1), Utc(6)));
        history.Seal(new() {
            ["moved"] = [Row(0, 0, 3, "A"), Row(1, 3, null, "B")],
            ["deleted"] = [Row(0, 0, 4, "A")],
            ["inserted"] = [Row(1, 4, null, "B")]
        }, []);
        var a = history.Compose(new(Utc(1), Utc(6)), "A", default);
        var b = history.Compose(new(Utc(1), Utc(6)), "B", default);
        Assert.False(a["moved"].CurrentInProduct);
        Assert.True(a["deleted"].Deleted);
        Assert.True(b["moved"].CurrentInProduct);
        Assert.Null(b["inserted"].BeforeCode);
        Assert.Empty(history.Compose(new(Utc(5), Utc(6)), "A", default));
    }

    /// <summary>Cancellation and out-of-range requests cannot return a partially trusted comparison.</summary>
    [Fact]
    public void InvalidWindowAndCancellationFailWithoutChangingHistory() {
        var history = new History(new(Utc(1), Utc(6)));
        history.Seal(new() { ["feature"] = [Row(0, 0, 3, "A"), Row(1, 3, null, "A")] }, []);
        Assert.Throws<ArgumentOutOfRangeException>(() => history.Compose(new(Utc(0), Utc(6)), "A", default));
        Assert.Throws<ArgumentOutOfRangeException>(() => history.Compose(new(Utc(1), Utc(5)), "A", default));
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(() => history.Compose(new(Utc(1), Utc(6)), "A", cancellation.Token));
        Assert.Single(history.Compose(new(Utc(1), Utc(6)), "A", default));
    }

    /// <summary>Many products and exact timestamps must match independent complete scans, including arbitrary intermediate versions and owners.</summary>
    [Fact]
    public void BulkHistoryMatchesIndependentScansAcrossManyWindows() {
        var random = new Random(1741);
        var history = new History(new(Utc(1), Utc(6)));
        var versions = new Dictionary<string, List<Version>>(StringComparer.OrdinalIgnoreCase);
        var targets = new List<ArchiveBindingTarget>();
        for (var i = 0; i < 1200; i++) {
            var id = new Guid(i + 1, 0, 0, new byte[8]).ToString("B");
            versions[id] = [Row(random.Next(3), 0, 2, "P" + random.Next(12)), Row(random.Next(3), 2, 4, "P" + random.Next(12)), Row(random.Next(3), 4, i % 7 == 0 ? 5 : null, "P" + random.Next(12))];
            if (i % 6 != 0) continue;
            var target = new ArchiveBindingTarget(i % 12 == 0 ? ArchiveBindingKind.Information : ArchiveBindingKind.Feature, Guid.Parse(id));
            targets.Add(target);
            versions[id] = versions[id].Select(version => version with { Products = null }).ToList();
            history.Owners.Add(new(new(Utc(0), Utc(3)), [target], ["P" + random.Next(12)]));
            history.Owners.Add(new(new(Utc(3), Utc(5)), [target], ["P" + random.Next(12)]));
            history.Owners.Add(new(new(Utc(5), null), [target], ["P" + random.Next(12)]));
        }
        history.Seal(versions, targets);
        for (var minute = 60; minute < 360; minute += 7) {
            var window = new ArchiveScanWindow(Utc(0).AddMinutes(minute), Utc(6));
            for (var source = 0; source < 12; source++) {
                var name = "P" + source;
                var expected = Reference(versions, targets, history.Owners, window, name);
                var actual = history.Compose(window, name, default);
                Assert.Equal(expected.Count, actual.Count);
                foreach (var (id, row) in expected)
                    Assert.Equal(JsonSerializer.Serialize(row), JsonSerializer.Serialize(actual[id]));
            }
        }
    }

    /// <summary>Models the original separate scan, including filtering versions before attaching products and resolving incoming owners at exact endpoints.</summary>
    private static Dictionary<string, ArchiveRow> Reference(Dictionary<string, List<Version>> versions, List<ArchiveBindingTarget> targets, List<Owner> owners, ArchiveScanWindow window, string source) {
        var changedTargets = targets.Where(target => versions[target.SourceId].Any(version => version.Interval.LatestEvent(window).HasValue)).ToHashSet();
        var index = new ArchiveBindingIndex(changedTargets, window);
        foreach (var owner in owners)
            index.AddOwner(owner.Interval, owner.Targets.Where(changedTargets.Contains).ToArray(), () => owner.Products);
        var result = new Dictionary<string, ArchiveRow>();
        foreach (var (id, rows) in versions) {
            var observed = rows.Where(row => row.Interval.LatestEvent(window).HasValue).ToArray();
            if (observed.Length == 0) continue;
            var target = targets.SingleOrDefault(target => target.SourceId == id);
            var associated = targets.Contains(target);
            var selected = observed.Where(row => row.Products?.Contains(source) == true).ToArray();
            if (associated ? !index.Affected.TryGetValue(source, out var affected) || !affected.Contains(target) : selected.Length == 0) continue;
            var endpoints = window.Compose(observed, row => row.Interval);
            var change = ArchiveChangeComposer.Compose(endpoints.Before?.Row, endpoints.After?.Row, endpoints.Latest.Row, endpoints.LatestEditUtc, false);
            change.CurrentInProduct = associated ? index.IsCurrent(source, target) : selected.Any(row => row.Interval.Contains(window.ThroughUtc));
            result[id] = change;
        }
        return result;
    }

    /// <summary>Creates a managed archived version with predetermined product matches instead of opening a geodatabase.</summary>
    private static Version Row(int value, int from, int? to, params string[] products) =>
        new(new ArchiveRow { Code = "DepthContour", AttributeBindings = "{\"value\":" + value + "}", NominalScale = 1000 }, new(Utc(from), to.HasValue ? Utc(to.Value) : null), null, products);

    /// <summary>Supplies fixed UTC instants independent of the machine's clock and timezone.</summary>
    private static DateTime Utc(int hour) => new(2026, 11, 9, hour, 0, 0, DateTimeKind.Utc);
}
