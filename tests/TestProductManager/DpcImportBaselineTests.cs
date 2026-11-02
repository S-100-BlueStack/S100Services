using Microsoft.Extensions.Configuration;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;

namespace TestProductCatalogueAPI;

/// <summary>Exercises import exclusion through real coordinator and export logic with isolated stores.</summary>
public sealed class DpcImportBaselineTests
{
    /// <summary>Offset input is normalized explicitly instead of using the Worker's machine timezone.</summary>
    [Fact]
    public void CopenhagenCompletionTimeIsNormalizedToUtc() {
        var configuration = Config("2026-11-01T18:41:50+01:00");
        Assert.Equal(new DateTime(2026, 11, 1, 17, 41, 50, DateTimeKind.Utc),
            DpcArchiveBaseline.ReadConfigured(configuration, new DateTime(2026, 11, 2, 0, 0, 0, DateTimeKind.Utc)));
    }

    /// <summary>Ambiguous or future cutoffs must fail without silently skipping source changes.</summary>
    [Theory]
    [InlineData("01-11-2026 18:41:50")]
    [InlineData("2026-11-01T18:41:50")]
    [InlineData("2026-13-01T18:41:50Z")]
    [InlineData("2099-11-01T18:41:50Z")]
    public void InvalidConfigurationIsRejected(string value) =>
        Assert.Throws<InvalidOperationException>(() => DpcArchiveBaseline.ReadConfigured(Config(value), DpcRunFixture.Utc(10)));

    /// <summary>The import is the comparison state, while an edit of the same feature after the cutoff still triggers export.</summary>
    [Fact]
    public async Task ImportedRowsAreSkippedButLaterEditsOfTheSameFeatureAreExported() {
        var f = await DpcRunFixture.CreateAsync();
        f.Configuration = Config(DpcRunFixture.Utc(9).ToString("O"));
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(8).AddMinutes(30), 10);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(9), 10);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9).AddMinutes(30), 67);

        await f.RunAsync();

        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Equal(DpcRunFixture.Utc(9), package.ScanFromUtc);
        Assert.Contains(DpcRunFixture.A, package.SummaryYaml);
        Assert.DoesNotContain(DpcRunFixture.B, package.SummaryYaml);
        Assert.All(f.Archive.Scans, scan => Assert.True(scan.From >= DpcRunFixture.Utc(9)));
        Assert.Equal(2, f.Engine.Requests.Count);
    }

    /// <summary>A fresh system starts at the explicit import cutoff rather than silently using local midnight.</summary>
    [Fact]
    public async Task FreshCheckpointUsesTheConfiguredBaseline() {
        var f = await DpcRunFixture.CreateAsync(initializeCheckpoint: false);
        f.Configuration = Config(DpcRunFixture.Utc(7).ToString("O"));
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(8), 67);
        await f.RunAsync();
        Assert.Equal(DpcRunFixture.Utc(7), f.Archive.Scans[0].From);
        Assert.Equal(DpcRunFixture.Utc(7), Assert.Single(f.Packages.Active.Values).ScanFromUtc);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
    }

    /// <summary>Neither a restart without the setting nor old replay can bring imported events back.</summary>
    [Fact]
    public async Task PersistedBaselineSurvivesConfigurationRemovalAndClampsReplay() {
        var f = await DpcRunFixture.CreateAsync();
        f.Configuration = Config(DpcRunFixture.Utc(9).ToString("O"));
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(8).AddMinutes(30), 10);
        await f.RunAsync();
        Assert.Empty(f.Packages.Active);
        f.Configuration = Config(null);
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(7);
        f.Packages.SnapshotAttempts[DpcRunFixture.Source] = DpcRunFixture.Utc(8);
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.Scans.Clear();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 67);

        await f.RunAsync();

        Assert.All(f.Archive.Scans, scan => Assert.True(scan.From >= DpcRunFixture.Utc(9)));
        Assert.Single(f.Packages.Active);
        Assert.Empty(f.Packages.Replay);
        Assert.Empty(f.Packages.SnapshotAttempts);
        Assert.Equal(DpcRunFixture.Utc(9), await f.Workflow.GetLastSuccessfulRunUtcAsync(DpcArchiveBaseline.StateKey));
    }

    /// <summary>Already built import candidates are discarded as a pair and later edits are rebuilt from the new baseline.</summary>
    [Fact]
    public async Task ExistingPackageIsRebuiltWithoutImportChangesInItsSummary() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var previous = f.Packages.Active[DpcRunFixture.Source];
        f.Configuration = Config(DpcRunFixture.Utc(9).AddMinutes(30).ToString("O"));
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 67);

        await f.RunAsync();

        var replacement = Assert.Single(f.Packages.Active.Values);
        Assert.NotEqual(previous.Id, replacement.Id);
        Assert.Equal(DpcRunFixture.Utc(9).AddMinutes(30), replacement.ScanFromUtc);
        Assert.DoesNotContain(DpcRunFixture.A, replacement.SummaryYaml);
        Assert.Contains(DpcRunFixture.B, replacement.SummaryYaml);
        Assert.Equal(1, f.Packages.PairedDiscards);
        Assert.Equal(4, f.Engine.Requests.Count);
        Assert.Equal(0, f.PublicationCalls);
    }

    /// <summary>Import-only candidates disappear without creating replacement exports.</summary>
    [Fact]
    public async Task ExistingImportOnlyPackageIsRemovedAndReplayRetired() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        f.Configuration = Config(DpcRunFixture.Utc(9).AddMinutes(30).ToString("O"));
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Empty(f.Packages.Active);
        Assert.Empty(f.Packages.Replay);
        Assert.Equal(2, f.Engine.Requests.Count);
    }

    /// <summary>A failed pre-baseline snapshot cannot leave import-only errors permanently blocking a source.</summary>
    [Fact]
    public async Task FailedImportOnlySnapshotIsAcknowledgedWithoutRetryingItsExport() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 10);
        f.FailAllSnapshots = true;
        await f.RunAsync();
        Assert.Equal(ProductState.Error, (await f.TrackAsync(ProductSpecification.S101)).State);
        f.Configuration = Config(DpcRunFixture.Utc(9).AddMinutes(30).ToString("O"));
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.FailAllSnapshots = false;
        await f.RunAsync();
        Assert.Equal(1, f.SnapshotCalls);
        Assert.Equal(ProductState.Idle, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(ProductState.Idle, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Empty(f.Packages.Replay);
        Assert.Empty(f.Engine.Requests);
    }

    /// <summary>Reconciliation cannot override a hold or advance archive progress past unresolved work.</summary>
    [Fact]
    public async Task ProtectedPackageStopsReconciliationWithoutAdvancingTheScanCheckpoint() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        (await f.TrackAsync(ProductSpecification.S57)).IsManuallyFrozen = true;
        f.Configuration = Config(DpcRunFixture.Utc(9).AddMinutes(30).ToString("O"));
        f.Clock.Now = DpcRunFixture.Utc(12);
        await Assert.ThrowsAsync<InvalidOperationException>(() => f.RunAsync());
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
        Assert.Equal(0, f.Packages.PairedDiscards);
    }

    /// <summary>A failed cleanup can resume after restart because the cutoff is committed before discard.</summary>
    [Fact]
    public async Task CancelledReconciliationResumesWithoutTheConfigurationSetting() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        f.Configuration = Config(DpcRunFixture.Utc(9).AddMinutes(30).ToString("O"));
        f.Clock.Now = DpcRunFixture.Utc(12);
        using var cancellation = new CancellationTokenSource();
        f.Packages.CancelAfterDiscard = cancellation;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => f.RunAsync(cancellation.Token));
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
        f.Packages.CancelAfterDiscard = null;
        f.Configuration = Config(null);
        await f.RunAsync();
        Assert.Empty(f.Packages.Active);
        Assert.Empty(f.Packages.Replay);
        Assert.Equal(DpcRunFixture.Utc(12), await f.WatermarkAsync());
    }

    /// <summary>A configuration rollback cannot reintroduce a previously excluded import interval.</summary>
    [Fact]
    public void AStoredBaselineCannotMoveBackward() {
        Assert.Throws<InvalidOperationException>(() => DpcArchiveBaseline.Resolve(DpcRunFixture.Utc(8), DpcRunFixture.Utc(9)));
        Assert.Equal(DpcRunFixture.Utc(9), DpcArchiveBaseline.Clamp(DpcRunFixture.Utc(7), DpcRunFixture.Utc(9)));
        Assert.Equal(DpcRunFixture.Utc(11), DpcArchiveBaseline.Clamp(DpcRunFixture.Utc(11), DpcRunFixture.Utc(9)));
    }

    /// <summary>Import exclusion must not prevent an operator from requesting a full paired snapshot.</summary>
    [Fact]
    public async Task ManualExportSkipsImportedChangeSummaryButStillBuildsBothMembers() {
        var f = await DpcRunFixture.CreateAsync();
        f.Configuration = Config(DpcRunFixture.Utc(9).ToString("O"));
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(8).AddMinutes(30), 10);
        await f.ManualAsync();
        Assert.Equal(2, f.Engine.Requests.Count);
        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Equal(DpcRunFixture.Utc(9), package.ScanFromUtc);
        Assert.Contains("changes: []", package.SummaryYaml);
        Assert.Contains("latestArchiveEditUtc: null", package.SummaryYaml);
        Assert.Equal(DpcRunFixture.Utc(8), await f.WatermarkAsync());
    }

    /// <summary>Creates an isolated configuration provider without changing deployment files.</summary>
    private static IConfiguration Config(string? value) => new ConfigurationBuilder().AddInMemoryCollection(
        new Dictionary<string, string?> { [DpcArchiveBaseline.ConfigurationKey] = value }).Build();
}
