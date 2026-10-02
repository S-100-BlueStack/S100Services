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

        Assert.False(EncPackageDetectionService.HasNewEdits(changes, detectedAtUtc, detectedAtUtc.AddMinutes(10)));
        changes["feature-1"].EditDate = detectedAtUtc.AddSeconds(2);
        Assert.True(EncPackageDetectionService.HasNewEdits(changes, detectedAtUtc, detectedAtUtc.AddMinutes(-1)));
    }

    [Fact]
    public void ArchiveRowsWithoutTimeUseTheScanWatermark() {
        var detectedAtUtc = new DateTime(2026, 10, 2, 8, 0, 0, DateTimeKind.Utc);
        var changes = new Dictionary<string, ArchiveRow> { ["feature-1"] = new() { Code = "BCNLAT" } };

        Assert.False(EncPackageDetectionService.HasNewEdits(changes, detectedAtUtc, detectedAtUtc.AddMinutes(-1)));
        Assert.True(EncPackageDetectionService.HasNewEdits(changes, detectedAtUtc, detectedAtUtc.AddMinutes(1)));
    }
}
