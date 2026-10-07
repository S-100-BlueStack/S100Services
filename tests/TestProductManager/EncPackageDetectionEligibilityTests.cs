using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class EncPackageDetectionEligibilityTests
{
    [Theory]
    [InlineData(ProductState.Error, false)]
    [InlineData(ProductState.Rejected, false)]
    [InlineData(ProductState.ReadyForDistribution, false)]
    [InlineData(ProductState.Idle, false)]
    [InlineData(ProductState.Frozen, true)]
    [InlineData(ProductState.Exporting, true)]
    [InlineData(ProductState.Validating, true)]
    [InlineData(ProductState.InTransit, true)]
    [InlineData(ProductState.AcceptedForDistribution, true)]
    [InlineData(ProductState.Published, true)]
    public void FreshEditsCanReplaceFailedCandidatesButNotHeldOrSubmittedCandidates(ProductState state, bool blocked) {
        var track = new ProductExportTrackRecord { State = state };

        Assert.Equal(blocked, EncPackageDetectionService.IsRefreshBlocked(track));
    }

    [Fact]
    public void ManualHoldBlocksRefreshEvenWhenTheCandidateFailed() {
        var track = new ProductExportTrackRecord { State = ProductState.Error, IsManuallyFrozen = true };

        Assert.True(EncPackageDetectionService.IsRefreshBlocked(track));
    }

    [Fact]
    public void ReplayedOldEditsDoNotRetryTheSameFailedPackage() {
        var detectedAtUtc = new DateTime(2026, 10, 2, 8, 0, 0, DateTimeKind.Utc);
        var changes = new Dictionary<string, ArchiveRow> {
            ["feature-1"] = new() { Code = "BCNLAT", EditDate = detectedAtUtc.AddSeconds(-2) }
        };

        Assert.False(EncPackageDetectionService.HasNewEdits(changes, detectedAtUtc));
        changes["feature-1"].EditDate = detectedAtUtc.AddSeconds(2);
        Assert.True(EncPackageDetectionService.HasNewEdits(changes, detectedAtUtc));
    }

    [Fact]
    public void ArchiveRowsWithoutTimeCannotTriggerDestructiveRefresh() {
        var detectedAtUtc = new DateTime(2026, 10, 2, 8, 0, 0, DateTimeKind.Utc);
        var changes = new Dictionary<string, ArchiveRow> { ["feature-1"] = new() { Code = "BCNLAT" } };

        Assert.Throws<InvalidOperationException>(() => EncPackageDetectionService.HasNewEdits(changes, detectedAtUtc));
    }

    [Fact]
    public void ArchiveDateWithOffsetIsComparedInUtc() {
        var editUtc = new DateTime(2026, 10, 6, 9, 34, 0, DateTimeKind.Utc);
        var archiveValue = new DateTimeOffset(2026, 10, 6, 11, 34, 0, TimeSpan.FromHours(2));

        Assert.Equal(editUtc, ProductManagerGDB.ReadArchiveUtc(archiveValue));
        Assert.Equal(DateTimeKind.Utc, ProductManagerGDB.ReadArchiveUtc(editUtc)!.Value.Kind);
    }

    [Theory]
    [InlineData(2026, 1, 6, 13, 47, 12, 47)]
    [InlineData(2026, 10, 6, 13, 47, 11, 47)]
    public void CopenhagenArchiveWallTimeFollowsDaylightSaving(int year, int month, int day, int hour, int minute, int utcHour, int utcMinute) {
        var wallTime = new DateTime(year, month, day, hour, minute, 13, DateTimeKind.Unspecified);
        var actualUtc = new DateTime(year, month, day, utcHour, utcMinute, 13, DateTimeKind.Utc);

        Assert.Equal(actualUtc, ProductManagerGDB.ReadArchiveUtc(wallTime));
        Assert.Equal(actualUtc, ProductManagerGDB.ReadArchiveUtc(actualUtc));
    }

    [Fact]
    public void AmbiguousCopenhagenArchiveWallTimeDoesNotAdvanceTheWatermark() {
        var ambiguous = new DateTime(2026, 10, 25, 2, 30, 0, DateTimeKind.Unspecified);
        Assert.Throws<InvalidOperationException>(() => ProductManagerGDB.ReadArchiveUtc(ambiguous));
    }
}
