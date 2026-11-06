using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

/// <summary>Exercises archive clock and version-window rules without opening an ArcGIS geodatabase.</summary>
public sealed class ArchiveClockWindowTests
{
    private static ArchiveClock CopenhagenClock() => new(ArchiveClock.ResolveTimeZone("Europe/Copenhagen"), ArchiveClock.ResolveTimeZone("Europe/Copenhagen"));
    private static DateTime Utc(int hour, int minute, int second = 0) => new(2026, 10, 7, hour, minute, second, DateTimeKind.Utc);
    private static DateTime Wall(int hour, int minute, int second = 0) => new(2026, 10, 7, hour, minute, second, DateTimeKind.Unspecified);
    private static readonly DateTime OpenEnd = new(9999, 12, 31);
    private sealed record Version(string Value, ArchiveInterval Interval);

    [Fact]
    public void ReportedCurveEditDoesNotPassThe1037UtcScan() {
        var clock = CopenhagenClock();
        var window = new ArchiveScanWindow(Utc(10, 37, 3).AddTicks(9366667), Utc(10, 39, 4));
        var importedAt = new DateTime(2026, 9, 28, 3, 0, 18);
        var editedAt = Wall(11, 14, 43);
        var sqlLower = clock.ToQueryLowerBound(window);

        Assert.Equal(Wall(12, 37, 3), sqlLower);
        Assert.Equal(DateTimeKind.Unspecified, sqlLower.Kind);
        Assert.False(SqlWouldSelect(importedAt, editedAt, sqlLower));
        Assert.False(SqlWouldSelect(editedAt, OpenEnd, sqlLower));
        Assert.Null(clock.ReadInterval(importedAt, editedAt, Utc(10, 40)).LatestEvent(window));
        Assert.Null(clock.ReadInterval(editedAt, OpenEnd, Utc(10, 40)).LatestEvent(window));
        Assert.Equal(Utc(9, 14, 43), clock.ReadUtc(editedAt));
    }

    [Fact]
    public void ClosingAnImportedVersionSelectsBothSidesOfTheEdit() {
        var clock = CopenhagenClock();
        var window = new ArchiveScanWindow(Utc(9, 0), Utc(9, 20));
        var importedAt = new DateTime(2026, 9, 28, 3, 0, 18);
        var editedAt = Wall(11, 14, 43);
        var sqlLower = clock.ToQueryLowerBound(window);
        var before = new Version("10", clock.ReadInterval(importedAt, editedAt, Utc(9, 21)));
        var after = new Version("67", clock.ReadInterval(editedAt, OpenEnd, Utc(9, 21)));

        Assert.True(SqlWouldSelect(importedAt, editedAt, sqlLower));
        Assert.True(SqlWouldSelect(editedAt, OpenEnd, sqlLower));
        var result = window.Compose(new[] { after, before }, version => version.Interval);
        Assert.Equal("10", result.Before!.Value);
        Assert.Equal("67", result.After!.Value);
        Assert.Equal(Utc(9, 14, 43), result.LatestEditUtc);
    }

    [Theory]
    [InlineData(1, 11)]
    [InlineData(7, 12)]
    [InlineData(10, 12)]
    public void SqlAndSdkClocksUseSeasonalCopenhagenOffsets(int month, int storageHour) {
        var clock = CopenhagenClock();
        var since = new DateTime(2026, month, 7, 10, 37, 3, DateTimeKind.Utc);
        var wall = new DateTime(2026, month, 7, storageHour, 37, 3);
        Assert.Equal(wall, clock.ToQueryLowerBound(new ArchiveScanWindow(since, since.AddMinutes(2))));
        Assert.Equal(since, clock.ReadUtc(wall));
        Assert.Equal(DateTimeKind.Utc, clock.ReadUtc(wall)!.Value.Kind);
    }

    [Fact]
    public void ExplicitInstantsAreNeverConvertedTwice() {
        var clock = CopenhagenClock();
        Assert.Equal(Utc(9, 14, 43), clock.ReadUtc(Utc(9, 14, 43)));
        Assert.Equal(Utc(9, 14, 43), clock.ReadUtc(new DateTimeOffset(Wall(11, 14, 43), TimeSpan.FromHours(2))));
        Assert.Equal(Utc(9, 14, 43), clock.ReadUtc(Utc(9, 14, 43).ToLocalTime()));
    }

    [Fact]
    public void SqlStorageAndUnspecifiedSdkValuesCanHaveDifferentClocks() {
        var clock = new ArchiveClock(TimeZoneInfo.Utc, ArchiveClock.ResolveTimeZone("Europe/Copenhagen"));
        Assert.Equal(Wall(10, 37), clock.ToQueryLowerBound(new ArchiveScanWindow(Utc(10, 37), Utc(10, 39))));
        Assert.Equal(Utc(9, 14, 43), clock.ReadUtc(Wall(11, 14, 43)));

        var utcSdk = new ArchiveClock(ArchiveClock.ResolveTimeZone("Europe/Copenhagen"), TimeZoneInfo.Utc);
        Assert.Equal(Utc(9, 14, 43), utcSdk.ReadUtc(Wall(9, 14, 43)));
        Assert.Equal(Wall(12, 37), utcSdk.ToQueryLowerBound(new ArchiveScanWindow(Utc(10, 37), Utc(10, 39))));
    }

    [Fact]
    public void RepeatedVersionsCompareOnlyTheTwoWindowEndpoints() {
        var window = new ArchiveScanWindow(Utc(9, 0), Utc(9, 30));
        var original = new Version("10", new ArchiveInterval(Utc(8, 0), Utc(9, 5)));
        var intermediate = new Version("20", new ArchiveInterval(Utc(9, 5), Utc(9, 15)));
        // This version was closed by an edit made after the scan's fixed cutoff.
        var atCutoff = new Version("67", new ArchiveInterval(Utc(9, 15), Utc(9, 35)));
        var later = new Version("90", new ArchiveInterval(Utc(9, 35), null));
        var versions = new[] { later, atCutoff, original, intermediate, atCutoff };

        var result = window.Compose(versions, version => version.Interval);
        Assert.Equal("10", result.Before!.Value);
        Assert.Equal("67", result.After!.Value);
        Assert.Equal(Utc(9, 15), result.LatestEditUtc);

        var next = new ArchiveScanWindow(window.ThroughUtc, Utc(9, 40)).Compose(versions, version => version.Interval);
        Assert.Equal("67", next.Before!.Value);
        Assert.Equal("90", next.After!.Value);
        Assert.Equal(Utc(9, 35), next.LatestEditUtc);
    }

    [Fact]
    public void DeleteAfterCutoffIsNotReportedUntilTheNextScan() {
        var version = new Version("67", new ArchiveInterval(Utc(9, 15), Utc(9, 35)));
        var current = new ArchiveScanWindow(Utc(9, 0), Utc(9, 30)).Compose(new[] { version }, value => value.Interval);
        Assert.NotNull(current.After);
        var next = new ArchiveScanWindow(Utc(9, 30), Utc(9, 40)).Compose(new[] { version }, value => value.Interval);
        Assert.NotNull(next.Before);
        Assert.Null(next.After);
        Assert.Equal(Utc(9, 35), next.LatestEditUtc);
    }

    [Fact]
    public void CreateThenDeleteInsideWindowHasNoEndpointState() {
        var version = new Version("temporary", new ArchiveInterval(Utc(9, 10), Utc(9, 20)));
        var result = new ArchiveScanWindow(Utc(9, 0), Utc(9, 30)).Compose(new[] { version }, value => value.Interval);
        Assert.Null(result.Before);
        Assert.Null(result.After);
    }

    [Fact]
    public void LowerBoundIsExclusiveAndUpperBoundIsInclusive() {
        var window = new ArchiveScanWindow(Utc(9, 0), Utc(9, 30));
        Assert.False(window.Contains(window.SinceUtc));
        Assert.True(window.Contains(window.SinceUtc.AddTicks(1)));
        Assert.True(window.Contains(window.ThroughUtc));
        Assert.False(window.Contains(window.ThroughUtc.AddTicks(1)));
        Assert.Null(new ArchiveInterval(Utc(8, 0), null).LatestEvent(window));
    }

    [Fact]
    public void QueryPrecisionCannotRoundPastAnUnconsumedEdit() {
        var clock = CopenhagenClock();
        var window = new ArchiveScanWindow(Utc(9, 0).AddMilliseconds(999), Utc(9, 30));
        Assert.Equal(Wall(11, 0), clock.ToQueryLowerBound(window));
        Assert.True(SqlWouldSelect(Wall(11, 0).AddMilliseconds(999.5), OpenEnd, clock.ToQueryLowerBound(window)));
    }

    [Fact]
    public void OpenEndIsNotConvertedOrTreatedAsAFutureEdit() {
        var clock = CopenhagenClock();
        var interval = clock.ReadInterval(Wall(11, 14, 43), OpenEnd, Utc(9, 20));
        Assert.Null(interval.ToUtc);
        Assert.Equal(Utc(9, 14, 43), interval.FromUtc);
        Assert.Throws<InvalidOperationException>(() => clock.ReadInterval(Wall(11, 30), OpenEnd, Utc(9, 20)));
        Assert.Throws<InvalidOperationException>(() => clock.ReadInterval(Wall(10, 0), Wall(11, 30), Utc(9, 20)));
    }

    [Fact]
    public void AmbiguousAndInvalidArchiveWallTimesPreserveTheWatermark() {
        var clock = CopenhagenClock();
        Assert.Throws<InvalidOperationException>(() => clock.ReadUtc(new DateTime(2026, 10, 25, 2, 30, 0)));
        Assert.Throws<InvalidOperationException>(() => clock.ReadUtc(new DateTime(2026, 3, 29, 2, 30, 0)));
        var repeatedHour = new DateTime(2026, 10, 25, 0, 30, 0, DateTimeKind.Utc);
        Assert.Throws<InvalidOperationException>(() => clock.ToQueryLowerBound(new ArchiveScanWindow(repeatedHour, repeatedHour.AddHours(2))));
        Assert.Equal(repeatedHour, clock.ReadUtc(repeatedHour));
    }

    [Fact]
    public void UnexplainedOldQueryResultsFailWithAClockDiagnostic() {
        var clock = CopenhagenClock();
        var window = new ArchiveScanWindow(Utc(10, 37), Utc(10, 39));
        var old = clock.ReadInterval(Wall(11, 14, 43), OpenEnd, Utc(10, 40));
        Assert.Throws<InvalidOperationException>(() => clock.VerifyQueryCandidate(old, window));
        clock.VerifyQueryCandidate(new ArchiveInterval(Utc(10, 37).AddMilliseconds(-100), null), window);
    }

    [Fact]
    public void InvalidWindowKindsAndOrderAreRejected() {
        Assert.Throws<ArgumentException>(() => new ArchiveScanWindow(Wall(10, 37), Utc(10, 39)));
        Assert.Throws<InvalidOperationException>(() => new ArchiveScanWindow(Utc(10, 39), Utc(10, 37)));
    }

    private static bool SqlWouldSelect(DateTime from, DateTime to, DateTime lower) => from > lower || to > lower && to < OpenEnd;
}
