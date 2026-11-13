using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC;
using S100FC.ProductCatalogue;
using S100FC.Topology;
using S100FC.YAML;
using System.Reflection;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI;

/// <summary>Runs the real detector and export service with bounded archive versions and isolated persistence/encoder boundaries.</summary>
public sealed class DpcRunAsyncTests
{
    /// <summary>New source edits cannot bypass acknowledgement of a rejection or a failed send.</summary>
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SubmittedFailuresWaitForOperatorAcknowledgement(bool sendFailure) {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        if (sendFailure) package.ErrorMessage = EncPackageFailureRules.SendFailureMessage;
        else (await f.TrackAsync(ProductSpecification.S57)).State = ProductState.Rejected;
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 2);
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(0, f.Packages.PairedDiscards);
    }

    /// <summary>Acknowledgement defeats old global/replay bounds; a later edit builds both members above their abandoned editions.</summary>
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AcknowledgedSourceWaitsForNewEditsThenAdvancesBothEditions(bool reusableArchive) {
        var f = await DpcRunFixture.CreateAsync(reusableArchive: reusableArchive);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.Packages.Acknowledged[DpcRunFixture.Source] = DpcRunFixture.Utc(10);
        var s101 = await f.TrackAsync(ProductSpecification.S101);
        var s57 = await f.TrackAsync(ProductSpecification.S57);
        s101.AcknowledgedEdition = 1;
        s57.AcknowledgedEdition = 5;
        // Model a cursor retained by a scan that began before the acknowledgement.
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(8);
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Empty(f.Packages.Active);
        Assert.Empty(f.Engine.Requests);
        Assert.Equal(DpcRunFixture.Utc(12), await f.WatermarkAsync());
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(13), 2);
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(2, s101.CandidateEdition);
        Assert.Equal(6, s57.CandidateEdition);
        Assert.All(f.Engine.Requests, request => Assert.Equal(0, request.Update));
        Assert.Equal(ProductState.ReadyForDistribution, s101.State);
        Assert.Equal(ProductState.ReadyForDistribution, s57.State);
        Assert.Contains("A=1", f.Packages.Active[DpcRunFixture.Source].DatasetYaml);
        Assert.Contains("B=2", f.Packages.Active[DpcRunFixture.Source].DatasetYaml);
    }

    /// <summary>Removing a feature from a partially accepted failed snapshot still creates higher editions even if S-128 never published that feature.</summary>
    [Fact]
    public async Task RemovalFromAcknowledgedCandidateUsesRetiredSnapshotMembership() {
        var f = await DpcRunFixture.CreateAsync();
        f.PublishedEditions[DpcRunFixture.Source] = 1;
        f.PublishedYaml[DpcRunFixture.Source] = new YamlDataset { CellName = DpcRunFixture.Source + ".000", Edition = 1 }.Serialize();
        f.Packages.Acknowledged[DpcRunFixture.Source] = DpcRunFixture.Utc(10);
        f.Packages.AcknowledgedYaml[DpcRunFixture.Source] = f.Archive.Snapshot(DpcRunFixture.Source, DpcRunFixture.Utc(10), 2).Serialize();
        (await f.TrackAsync(ProductSpecification.S101)).AcknowledgedEdition = 2;
        (await f.TrackAsync(ProductSpecification.S57)).AcknowledgedEdition = 5;
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 0, scale: 2000);
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(3, (await f.TrackAsync(ProductSpecification.S101)).CandidateEdition);
        Assert.Equal(6, (await f.TrackAsync(ProductSpecification.S57)).CandidateEdition);
        Assert.Contains(DpcRunFixture.A, f.Packages.Active[DpcRunFixture.Source].SummaryYaml);
    }

    /// <summary>An acknowledgement committed after archive inspection prevents stale work in that same scan.</summary>
    [Fact]
    public async Task AcknowledgementDuringScanDefersTheStaleSource() {
        var f = await DpcRunFixture.CreateAsync(reusableArchive: true);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Locks.OnAcquire = name => {
            if (name == ProductTrackLockKey.For(DpcRunFixture.Source, ProductSpecification.S101))
                f.Packages.Acknowledged[DpcRunFixture.Source] = DpcRunFixture.Utc(11);
        };
        await f.RunAsync();
        Assert.Empty(f.Engine.Requests);
        Assert.Empty(f.Packages.Active);
        Assert.Equal(DpcRunFixture.Utc(11), f.Packages.Replay[DpcRunFixture.Source]);
    }

    /// <summary>Distinct package windows use source-specific reader calls and still build the same paired replacements.</summary>
    [Fact]
    public async Task ReusableHistoryRoutesEachPackageWindowWithoutWholeDatabaseRescans() {
        var f = await DpcRunFixture.CreateAsync(reusableArchive: true);
        const string second = "101DK002";
        f.Archive.AddSource(second, 1000);
        f.Archive.AddFeature(second, DpcRunFixture.A, 0);
        foreach (var source in new[] { DpcRunFixture.Source, second })
            f.Archive.Edit(source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        var index = 0;
        foreach (var package in f.Packages.Active.Values) {
            package.ScanFromUtc = DpcRunFixture.Utc(8).AddMinutes(++index);
            package.DetectedAtUtc = DpcRunFixture.Utc(10).AddMinutes(index);
            f.Archive.Edit(package.SourceDatasetName, DpcRunFixture.A, DpcRunFixture.Utc(11), 2);
        }
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Equal(2, f.WholeArchiveReads);
        Assert.Equal(4, f.SourceArchiveReads.Count);
        Assert.Equal(4, f.SourceArchiveReads.Distinct().Count());
        Assert.Equal(DpcRunFixture.Utc(8).AddMinutes(1), f.HistoryBounds.Last().From);
        Assert.Equal(DpcRunFixture.Utc(12), f.HistoryBounds.Last().Through);
        Assert.Equal(2, f.DisposedHistoryReaders);
        Assert.Equal(8, f.Engine.Requests.Count);
        Assert.Equal(DpcRunFixture.Utc(12), await f.WatermarkAsync());
        Assert.All(f.Packages.Active.Values, package => Assert.Contains("A=2", package.DatasetYaml));
    }

    /// <summary>A failed reusable comparison must finish before any existing candidate is discarded or rebuilt.</summary>
    [Fact]
    public async Task ReusableHistoryFailurePreservesCheckpointAndExistingPair() {
        var f = await DpcRunFixture.CreateAsync(reusableArchive: true);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        package.DetectedAtUtc = DpcRunFixture.Utc(10).AddMinutes(1);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 2);
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.FailFrom = package.DetectedAtUtc;
        await Assert.ThrowsAsync<InvalidOperationException>(() => f.RunAsync());
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(0, f.Packages.PairedDiscards);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
        Assert.Equal(2, f.DisposedHistoryReaders);
    }

    /// <summary>A manual request creates both members without depending on an archive edit or advancing DPC.</summary>
    [Fact]
    public async Task ManualExportBuildsThePairWithoutNewEdits() {
        var f = await DpcRunFixture.CreateAsync();
        var id = await f.ManualAsync();
        Assert.Equal(id, f.Packages.Active[DpcRunFixture.Source].Id);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(f.Engine.Requests[0].DatasetYaml, f.Engine.Requests[1].DatasetYaml);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Equal(DpcRunFixture.Utc(8), await f.WatermarkAsync());
        Assert.Equal(0, f.PublicationCalls);
        await Assert.ThrowsAsync<ExportOperationRejectedException>(() => f.ManualAsync());
        Assert.Equal(2, f.Engine.Requests.Count);
    }

    /// <summary>A failed first compiler leaves a durable failed pair and still attempts the second member.</summary>
    [Fact]
    public async Task ManualExportAttemptsS57AfterS101Fails() {
        var f = await DpcRunFixture.CreateAsync();
        f.Engine.FailDataset = DpcRunFixture.Source;
        await Assert.ThrowsAsync<InvalidOperationException>(() => f.ManualAsync());
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Single(f.Packages.Active);
        Assert.Equal(ProductState.Error, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Equal(DpcRunFixture.Utc(8), await f.WatermarkAsync());
    }

    /// <summary>A hold on either member prevents reserving or compiling either candidate.</summary>
    [Theory]
    [InlineData(ProductSpecification.S101)]
    [InlineData(ProductSpecification.S57)]
    public async Task ManualExportProtectsEitherMembersHold(ProductSpecification specification) {
        var f = await DpcRunFixture.CreateAsync();
        (await f.TrackAsync(specification)).IsManuallyFrozen = true;
        await Assert.ThrowsAsync<ExportOperationRejectedException>(() => f.ManualAsync());
        Assert.Empty(f.Packages.Active);
        Assert.Empty(f.Engine.Requests);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FirstSourceSnapshotFailureDoesNotBlockTheOtherThreeProducts(bool invalidSnapshot) {
        var f = await DpcRunFixture.CreateAsync();
        var sources = new[] { DpcRunFixture.Source, "101DK002", "101DK003", "101DK004" };
        foreach (var source in sources.Skip(1)) {
            f.Archive.AddSource(source, 1000);
            f.Archive.AddFeature(source, DpcRunFixture.A, 0);
        }
        foreach (var source in sources) f.Archive.Edit(source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.FailSnapshotSource = DpcRunFixture.Source;
        f.InvalidSnapshot = invalidSnapshot;

        await f.RunAsync();

        Assert.Equal(3, f.Packages.Active.Count);
        Assert.Equal(6, f.Engine.Requests.Count);
        Assert.DoesNotContain(f.Engine.Requests, request => request.DatasetName == DpcRunFixture.Source);
        Assert.Equal(ProductState.Error, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(ProductState.Error, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Equal("ENC_SOURCE_SNAPSHOT_FAILED", (await f.TrackAsync(ProductSpecification.S101)).ErrorCode);
        Assert.Null((await f.TrackAsync(ProductSpecification.S101)).CandidateEdition);
        Assert.Equal(DpcRunFixture.Utc(8), f.Packages.Replay[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
        Assert.Equal(0, f.PublicationCalls);
        var completed = f.Packages.Active.Values.Select(p => p.Id).ToArray();
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Equal(completed.OrderBy(id => id), f.Packages.Active.Values.Select(p => p.Id).OrderBy(id => id));
        Assert.Equal(6, f.Engine.Requests.Count);
        Assert.Equal(4, f.SnapshotCalls);
        Assert.Equal(DpcRunFixture.Utc(10), f.Packages.SnapshotAttempts[DpcRunFixture.Source]);
        Assert.Equal(PublicExportError.GenericMessage, (await f.TrackAsync(ProductSpecification.S101)).ErrorMessage);
        f.FailSnapshotSource = null;
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Equal(4, f.SnapshotCalls);
        Assert.Equal(3, f.Packages.Active.Count);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(15), 2);
        f.Clock.Now = DpcRunFixture.Utc(16);
        await f.RunAsync();
        Assert.Equal(4, f.Packages.Active.Count);
        Assert.Equal(8, f.Engine.Requests.Count);
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task FailedReplacementSnapshotKeepsTheOldPairAndCumulativeReplayUntilRecovery() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var previous = f.Packages.Active[DpcRunFixture.Source];
        var candidate = (await f.TrackAsync(ProductSpecification.S101)).CandidateEdition;
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 2);
        f.FailSnapshotSource = DpcRunFixture.Source;
        await f.RunAsync();
        Assert.Same(previous, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(PublicExportError.GenericMessage, previous.ErrorMessage);
        Assert.Equal(candidate, (await f.TrackAsync(ProductSpecification.S101)).CandidateEdition);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(0, f.Packages.PairedDiscards);
        Assert.Equal(previous.ScanFromUtc, f.Packages.Replay[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(12), await f.WatermarkAsync());
        f.FailSnapshotSource = null;
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Same(previous, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(2, f.SnapshotCalls);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(15), 3);
        f.Clock.Now = DpcRunFixture.Utc(16);
        await f.RunAsync();
        Assert.NotEqual(previous.Id, f.Packages.Active[DpcRunFixture.Source].Id);
        Assert.Equal(previous.ScanFromUtc, f.Packages.Active[DpcRunFixture.Source].ScanFromUtc);
        Assert.Equal(4, f.Engine.Requests.Count);
    }

    [Fact]
    public async Task FourFailedProductsStayCheckpointedUntilOnlyOneReceivesANewArchiveEdit() {
        var f = await DpcRunFixture.CreateAsync();
        var sources = new[] { DpcRunFixture.Source, "101DK002", "101DK003", "101DK004" };
        foreach (var source in sources.Skip(1)) {
            f.Archive.AddSource(source, 1000);
            f.Archive.AddFeature(source, DpcRunFixture.A, 0);
        }
        foreach (var source in sources) f.Archive.Edit(source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.FailAllSnapshots = true;
        await f.RunAsync();
        Assert.Equal(4, f.SnapshotCalls);
        Assert.Equal(4, f.Packages.SnapshotAttempts.Count);
        f.FailAllSnapshots = false;
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync(); // RunAsync constructs a new coordinator; checkpoints survive its lifetime.
        Assert.Equal(4, f.SnapshotCalls);
        Assert.Empty(f.Engine.Requests);
        f.Archive.Edit(sources[2], DpcRunFixture.A, DpcRunFixture.Utc(13), 2);
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Equal(5, f.SnapshotCalls);
        Assert.Equal(sources[2], Assert.Single(f.Packages.Active.Values).SourceDatasetName);
        Assert.Equal(3, f.Packages.SnapshotAttempts.Count);
        Assert.Equal(2, f.Engine.Requests.Count);
    }

    [Fact]
    public async Task FailedAttemptUsesTheScanCutoffSoEditsDuringTheBuildRemainEligible() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.FailSnapshotSource = DpcRunFixture.Source;
        f.BeforeSnapshot = () => {
            f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 2);
            f.Clock.Now = DpcRunFixture.Utc(12);
        };
        await f.RunAsync();
        Assert.Equal(DpcRunFixture.Utc(10), f.Packages.SnapshotAttempts[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(12), (await f.TrackAsync(ProductSpecification.S101)).UpdatedAtUtc);
        f.BeforeSnapshot = null;
        f.FailSnapshotSource = null;
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Contains("A=2", Assert.Single(f.Packages.Active.Values).DatasetYaml);
        Assert.Empty(f.Packages.SnapshotAttempts);
    }

    [Fact]
    public async Task IncompleteAttemptInspectionNeverConsumesTheFailureCheckpoint() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.FailSnapshotSource = DpcRunFixture.Source;
        await f.RunAsync();
        await f.Workflow.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), DpcRunFixture.Utc(11));
        f.Clock.Now = DpcRunFixture.Utc(14);
        f.Archive.FailFrom = DpcRunFixture.Utc(10);
        await Assert.ThrowsAsync<InvalidOperationException>(() => f.RunAsync());
        Assert.Equal(DpcRunFixture.Utc(11), await f.WatermarkAsync());
        Assert.Equal(DpcRunFixture.Utc(10), f.Packages.SnapshotAttempts[DpcRunFixture.Source]);
        Assert.Equal(1, f.SnapshotCalls);
    }

    [Fact]
    public async Task HoldDoesNotConsumeANewEditOrAdvanceTheFailureCheckpoint() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.FailSnapshotSource = DpcRunFixture.Source;
        await f.RunAsync();
        var held = await f.TrackAsync(ProductSpecification.S57);
        held.IsManuallyFrozen = true;
        f.FailSnapshotSource = null;
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 2);
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Equal(1, f.SnapshotCalls);
        Assert.Equal(DpcRunFixture.Utc(10), f.Packages.SnapshotAttempts[DpcRunFixture.Source]);
        held.IsManuallyFrozen = false;
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Single(f.Packages.Active);
        Assert.Equal(2, f.SnapshotCalls);
        Assert.Empty(f.Packages.SnapshotAttempts);
    }

    [Fact]
    public async Task FullRevertAfterFailedInitialSnapshotClearsTheErrorWithoutBuildingAnExport() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.FailSnapshotSource = DpcRunFixture.Source;
        await f.RunAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 0);
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Empty(f.Packages.Active);
        Assert.Empty(f.Packages.SnapshotAttempts);
        Assert.Empty(f.Packages.Replay);
        Assert.Equal(1, f.SnapshotCalls);
        Assert.Equal(ProductState.Idle, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(ProductState.Idle, (await f.TrackAsync(ProductSpecification.S57)).State);
    }

    [Fact]
    public async Task SnapshotCancellationStillStopsTheInvocationAndPreservesItsWatermark() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        using var cancellation = new CancellationTokenSource();
        f.BeforeSnapshot = () => { cancellation.Cancel(); cancellation.Token.ThrowIfCancellationRequested(); };
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => f.RunAsync(cancellation.Token));
        Assert.Equal(DpcRunFixture.Utc(8), await f.WatermarkAsync());
        Assert.Empty(f.Packages.Active);
        Assert.Equal(ProductState.Idle, (await f.TrackAsync(ProductSpecification.S101)).State);
    }

    private const string Associated = "{ab9b3e89-d57c-47c2-a105-68ebb574db10}";

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AssociatedRowEditCreatesPairedCandidatesFromTheVerifiedOwnersSnapshot(bool information) {
        var f = await AssociatedFixtureAsync(information);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(9), 1);

        await f.RunAsync();

        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Contains(Associated, package.SummaryYaml);
        Assert.Contains(information ? "SpatialQuality" : "NauticalInformation", package.SummaryYaml);
        Assert.Contains("attributes.value", package.SummaryYaml);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.All(f.Engine.Requests, request => Assert.Equal(package.DatasetYaml, request.DatasetYaml));
        Assert.Equal(0, f.PublicationCalls);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, false)]
    [InlineData(true, true)]
    [InlineData(false, true)]
    public async Task AssociatedFullAndPartialRevertsReplaceOrRemoveBothMembers(bool information, bool partial) {
        var f = await AssociatedFixtureAsync(information);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(9), 1);
        if (partial) f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        var previous = f.Packages.Active[DpcRunFixture.Source];
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(11), 0);

        await f.RunAsync();

        Assert.Equal(1, f.Packages.PairedDiscards);
        if (partial) {
            var replacement = f.Packages.Active[DpcRunFixture.Source];
            Assert.NotEqual(previous.Id, replacement.Id);
            Assert.Equal(previous.ScanFromUtc, replacement.ScanFromUtc);
            Assert.Equal(DpcRunFixture.Utc(12), replacement.DetectedAtUtc);
            Assert.DoesNotContain(Associated, replacement.SummaryYaml);
            Assert.Contains(DpcRunFixture.B, replacement.SummaryYaml);
            Assert.Contains(Associated + "=0", replacement.DatasetYaml);
            Assert.Equal(4, f.Engine.Requests.Count);
        }
        else {
            Assert.Empty(f.Packages.Active);
            Assert.Equal(2, f.Engine.Requests.Count);
        }
        Assert.Empty(f.Packages.Replay);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AssociatedEditsRetainIndependentReplayBaselinesAndRespectHoldRelease(bool information) {
        var f = await AssociatedFixtureAsync(information);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        var previous = f.Packages.Active[DpcRunFixture.Source];
        var track = await f.TrackAsync(ProductSpecification.S57);
        track.IsManuallyFrozen = true;
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(11), 2);
        await f.RunAsync();
        Assert.Same(previous, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(10), f.Packages.Replay[DpcRunFixture.Source]);

        track.IsManuallyFrozen = false;
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();

        var replacement = f.Packages.Active[DpcRunFixture.Source];
        Assert.NotEqual(previous.Id, replacement.Id);
        Assert.Equal(previous.ScanFromUtc, replacement.ScanFromUtc);
        Assert.Contains(Associated + "=2", replacement.DatasetYaml);
        Assert.Equal(4, f.Engine.Requests.Count);
        Assert.Empty(f.Packages.Replay);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, false)]
    [InlineData(true, true)]
    [InlineData(false, true)]
    public async Task UnboundOrUnselectedAssociatedRowsDoNotCreatePackages(bool information, bool outsideTopology) {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.AddAssociated(Associated, information ? ArchiveBindingKind.Information : ArchiveBindingKind.Feature, 0);
        if (outsideTopology) f.Archive.Bind(DpcRunFixture.Source, DpcRunFixture.Outside, Associated);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(9), 1);

        await f.RunAsync();

        Assert.Empty(f.Packages.Active);
        Assert.Empty(f.Engine.Requests);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AssociatedDeletionUsesPersistedMembershipAndRetainsRemovalInLaterReplacements(bool information) {
        var f = await AssociatedFixtureAsync(information);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.DeleteAssociated(Associated, DpcRunFixture.Utc(11));

        await f.RunAsync();

        var replacement = f.Packages.Active[DpcRunFixture.Source];
        Assert.Contains(Associated, replacement.SummaryYaml);
        Assert.Contains("deleted: true", replacement.SummaryYaml);
        Assert.DoesNotContain(Associated + "=", replacement.DatasetYaml);
        f.Clock.Now = DpcRunFixture.Utc(14);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(13), 2);
        await f.RunAsync();
        Assert.Contains(Associated, f.Packages.Active[DpcRunFixture.Source].SummaryYaml);
        Assert.Equal(6, f.Engine.Requests.Count);
    }

    private static async Task<DpcRunFixture> AssociatedFixtureAsync(bool information) {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.AddAssociated(Associated, information ? ArchiveBindingKind.Information : ArchiveBindingKind.Feature, 0);
        f.Archive.Bind(DpcRunFixture.Source, DpcRunFixture.A, Associated);
        return f;
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AssociatedNetZeroAtEightStillChangesAgainstTheSecondSourcesTenOClockReplay(bool information) {
        var f = await AssociatedFixtureAsync(information);
        const string second = "101DK002";
        f.Archive.AddSource(second, 1000);
        f.Archive.ShareFeatures(DpcRunFixture.Source, second);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(9), 1);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(13), 0);
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(8);
        f.Packages.Replay[second] = DpcRunFixture.Utc(10);
        f.Clock.Now = DpcRunFixture.Utc(14);

        await f.RunAsync();

        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Equal(second, package.SourceDatasetName);
        Assert.Equal(DpcRunFixture.Utc(10), package.ScanFromUtc);
        Assert.Contains(Associated, package.SummaryYaml);
        Assert.Empty(f.Packages.Replay);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AssociatedSnapshotSurvivesCancellationAndRestartsTheWaitingMember(bool information) {
        var f = await AssociatedFixtureAsync(information);
        f.Archive.EditAssociated(Associated, DpcRunFixture.Utc(9), 1);
        using var cancellation = new CancellationTokenSource();
        f.Engine.DuringExport = _ => cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => f.RunAsync(cancellation.Token));
        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Equal(DpcRunFixture.Utc(8), await f.WatermarkAsync());
        Assert.Single(f.Packages.Replay);
        Assert.Equal(ProductState.ChangesDetected, (await f.TrackAsync(ProductSpecification.S57)).State);
        f.Engine.DuringExport = null;
        f.Clock.Now = DpcRunFixture.Utc(12);

        await f.RunAsync();

        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(1, f.SnapshotCalls);
        Assert.All(f.Engine.Requests, request => Assert.Equal(package.DatasetYaml, request.DatasetYaml));
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task CreationPersistsOneSnapshotBeforeBothIndependentExportsWithoutPublishingS128() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.Engine.ValidationErrors = 7;

        await f.RunAsync();

        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Equal(DpcRunFixture.Utc(8), package.ScanFromUtc);
        Assert.Equal(DpcRunFixture.Utc(10), package.DetectedAtUtc);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.All(f.Engine.Requests, request => Assert.Equal(package.DatasetYaml, request.DatasetYaml));
        Assert.Equal(1, f.Engine.Requests.Single(r => r.ProductSpecification == ProductSpecification.S101).Edition);
        Assert.Equal(5, f.Engine.Requests.Single(r => r.ProductSpecification == ProductSpecification.S57).Edition);
        Assert.All(f.Engine.Requests, request => Assert.Equal(0, request.Update));
        Assert.Equal(1, f.SnapshotCalls);
        Assert.Equal(0, f.PublicationCalls);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task BothMembersArePendingBeforeTheFirstCompilerCanComplete() {
        var f = await DpcRunFixture.CreateAsync();
        var observed = new List<(ProductState S101, ProductState S57)>();
        f.Engine.ObserveExport = async _ => observed.Add(((await f.TrackAsync(ProductSpecification.S101)).State, (await f.TrackAsync(ProductSpecification.S57)).State));
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        Assert.Equal(new[] { (ProductState.Exporting, ProductState.ChangesDetected), (ProductState.ReadyForDistribution, ProductState.Exporting) }, observed);
        Assert.Equal(ProductState.Idle, (await f.TrackAsync(ProductSpecification.S101)).CandidatePreviousState);
        Assert.Equal(ProductState.Idle, (await f.TrackAsync(ProductSpecification.S57)).CandidatePreviousState);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LegacyReadyIdlePackageIsRecoveredWithoutReplayOrNewArchiveEdits(bool failMissingExport) {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        var idle = await f.TrackAsync(ProductSpecification.S57);
        idle.State = ProductState.Idle;
        idle.CandidateEdition = null;
        idle.CandidateUpdate = null;
        idle.CandidatePreviousState = null;
        f.Packages.Replay.Clear();
        if (failMissingExport) f.Engine.FailDataset = DpcRunFixture.S57;
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(1, f.SnapshotCalls);
        Assert.Equal(3, f.Engine.Requests.Count);
        Assert.Equal(package.DatasetYaml, f.Engine.Requests.Last().DatasetYaml);
        Assert.Equal(DpcRunFixture.S57, f.Engine.Requests.Last().DatasetName);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(failMissingExport ? ProductState.Error : ProductState.ReadyForDistribution, idle.State);
        Assert.Equal(0, f.Packages.PairedDiscards);
    }

    [Theory]
    [InlineData(ProductState.ReadyForDistribution)]
    [InlineData(ProductState.Error)]
    public async Task LaterRelevantEditReplacesBothEligibleCandidatesAndRetainsBaseline(ProductState state) {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var previous = f.Packages.Active[DpcRunFixture.Source];
        var track = await f.TrackAsync(ProductSpecification.S57);
        track.State = state;
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 2);

        await f.RunAsync();

        var replacement = f.Packages.Active[DpcRunFixture.Source];
        Assert.NotEqual(previous.Id, replacement.Id);
        Assert.Equal(previous.ScanFromUtc, replacement.ScanFromUtc);
        Assert.Equal(DpcRunFixture.Utc(12), replacement.DetectedAtUtc);
        Assert.Equal(4, f.Engine.Requests.Count);
        Assert.Equal(1, f.Packages.PairedDiscards);
        Assert.Contains(DpcRunFixture.A, replacement.SummaryYaml);
        Assert.Contains(DpcRunFixture.B, replacement.SummaryYaml);
        Assert.Equal(0, f.PublicationCalls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FullAndPartialRevertsCannotLeaveStaleSourceInTheCandidate(bool partial) {
        var f = await DpcRunFixture.CreatedPackageAsync(includeB: true);
        var previous = f.Packages.Active[DpcRunFixture.Source];
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 0);
        if (!partial) f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 0);

        await f.RunAsync();

        Assert.Equal(1, f.Packages.PairedDiscards);
        if (partial) {
            var replacement = f.Packages.Active[DpcRunFixture.Source];
            Assert.NotEqual(previous.Id, replacement.Id);
            Assert.Equal(previous.ScanFromUtc, replacement.ScanFromUtc);
            Assert.DoesNotContain(DpcRunFixture.A, replacement.SummaryYaml);
            Assert.Contains(DpcRunFixture.B, replacement.SummaryYaml);
            Assert.Contains("A=0", replacement.DatasetYaml);
            Assert.Equal(DpcRunFixture.Utc(9), EncChangeSummary.GetLatestArchiveEditUtc(replacement.SummaryYaml));
            Assert.Equal(DpcRunFixture.Utc(12), replacement.DetectedAtUtc);
        }
        else {
            Assert.Empty(f.Packages.Active);
            Assert.Null((await f.TrackAsync(ProductSpecification.S101)).CandidateEdition);
            Assert.Null((await f.TrackAsync(ProductSpecification.S57)).CandidateEdition);
            Assert.Equal(2, f.Engine.Requests.Count);
        }
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task AnUnselectedFeatureDoesNotRefreshAnOtherwiseUnchangedCandidate() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.Outside, DpcRunFixture.Utc(11), 7);

        await f.RunAsync();

        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(0, f.Packages.PairedDiscards);
    }

    [Fact]
    public async Task EachReplayIsComposedAgainstItsExactCursorRatherThanFilteringAnEarlierNetResult() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.AddSource("101DK002", 1000);
        f.Archive.AddFeature("101DK002", DpcRunFixture.A, 0);
        f.Archive.Edit("101DK002", DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.Archive.Edit("101DK002", DpcRunFixture.A, DpcRunFixture.Utc(13), 0);
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(8);
        f.Packages.Replay["101DK002"] = DpcRunFixture.Utc(10);
        await f.Workflow.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), DpcRunFixture.Utc(12));
        f.Clock.Now = DpcRunFixture.Utc(14);

        await f.RunAsync();

        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Equal("101DK002", package.SourceDatasetName);
        Assert.Equal(DpcRunFixture.Utc(10), package.ScanFromUtc);
        Assert.Contains(DpcRunFixture.Utc(8), f.Archive.Scans.Select(s => s.From));
        Assert.Contains(DpcRunFixture.Utc(10), f.Archive.Scans.Select(s => s.From));
        Assert.All(f.Archive.Scans, scan => Assert.Equal(DpcRunFixture.Utc(14), scan.Through));
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task ScaleOnlyEditBuildsBothTheProductLosingAndTheProductGainingVerifiedMembership() {
        var f = await DpcRunFixture.CreateAsync();
        f.PublishedEditions[DpcRunFixture.Source] = 1;
        f.PublishedYaml[DpcRunFixture.Source] = f.Archive.Snapshot(DpcRunFixture.Source, DpcRunFixture.Utc(8), 1).Serialize();
        f.Archive.AddSource("101DK002", 2000);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 0, scale: 2000);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.Outside, DpcRunFixture.Utc(9), 0, scale: 2000);
        // The same physical feature is seen through both product coverages.
        f.Archive.ShareFeatures(DpcRunFixture.Source, "101DK002");

        await f.RunAsync();

        Assert.Equal(2, f.Packages.Active.Count);
        Assert.All(f.Packages.Active.Values, package => {
            Assert.Contains("$compilationscale", package.SummaryYaml);
            Assert.DoesNotContain(DpcRunFixture.Outside, package.SummaryYaml);
        });
        Assert.Equal(4, f.Engine.Requests.Count);
        Assert.DoesNotContain(TopologyFeatureMapping.CreateFoid(DpcRunFixture.A), f.Packages.Active[DpcRunFixture.Source].DatasetYaml);
        Assert.Contains(TopologyFeatureMapping.CreateFoid(DpcRunFixture.A), f.Packages.Active["101DK002"].DatasetYaml);
    }

    [Theory]
    [InlineData(ProductState.Frozen, false)]
    [InlineData(ProductState.ReadyForDistribution, true)]
    [InlineData(ProductState.InTransit, false)]
    [InlineData(ProductState.AcceptedForDistribution, false)]
    public async Task BlockedPackagePreservesReplayAndReleaseReconsidersDeferredEdits(ProductState state, bool manualHold) {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        var track = await f.TrackAsync(ProductSpecification.S57);
        track.State = state;
        track.IsManuallyFrozen = manualHold;
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 2);
        await f.RunAsync();
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(DpcRunFixture.Utc(10), f.Packages.Replay[DpcRunFixture.Source]);

        // Release is an explicit fixture transition, not something DPC is allowed to perform.
        track.State = ProductState.ReadyForDistribution;
        track.IsManuallyFrozen = false;
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.NotEqual(package.Id, f.Packages.Active[DpcRunFixture.Source].Id);
        Assert.Equal(4, f.Engine.Requests.Count);
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task HoldBeforeFirstDetectionDefersCreationUntilRelease() {
        var f = await DpcRunFixture.CreateAsync();
        var held = await f.TrackAsync(ProductSpecification.S57);
        held.IsManuallyFrozen = true;
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        Assert.Empty(f.Packages.Active);
        Assert.Equal(DpcRunFixture.Utc(8), f.Packages.Replay[DpcRunFixture.Source]);
        held.IsManuallyFrozen = false;
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Single(f.Packages.Active);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task CriticalValidationFailureKeepsDiagnosticsAndTheOtherIndependentCandidate() {
        var f = await DpcRunFixture.CreateAsync();
        f.Engine.CriticalDataset = DpcRunFixture.Source;
        f.Engine.ValidationErrors = 7;
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        var track = await f.TrackAsync(ProductSpecification.S101);
        Assert.Equal(ProductState.Error, track.State);
        Assert.NotNull(track.ErrorCode);
        Assert.Single(await f.Workflow.GetValidationArtifactHistoryAsync(track.Id));
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Equal(2, f.Engine.Requests.Count);
    }

    [Theory]
    [InlineData("Sending", false)]
    [InlineData("Delivered", false)]
    [InlineData("Uncertain", false)]
    [InlineData("Accepted", false)]
    [InlineData("NotDelivered", true)]
    public async Task ExactDeliveryOutcomeProtectsBothMembersAndEmptyReplay(string status, bool replace) {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        f.Packages.Delivery[DpcRunFixture.S57] = status;
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(10);
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Equal(!replace, f.Packages.Replay.ContainsKey(DpcRunFixture.Source));
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(13), 2);
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Equal(replace, package.Id != f.Packages.Active[DpcRunFixture.Source].Id);
        Assert.Equal(replace ? 4 : 2, f.Engine.Requests.Count);
        Assert.Equal(replace ? 1 : 0, f.Packages.PairedDiscards);
        if (!replace) Assert.NotNull((await f.TrackAsync(ProductSpecification.S101)).CandidateEdition);
    }

    [Fact]
    public async Task PartialExportFailureRetainsDiagnosticsAndDoesNotPreventItsCounterpartOrRetryWithoutNewEdits() {
        var f = await DpcRunFixture.CreateAsync();
        f.Engine.FailDataset = DpcRunFixture.Source;
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        await f.RunAsync();
        var package = Assert.Single(f.Packages.Active.Values);
        Assert.NotNull(package.ErrorMessage);
        Assert.Equal(ProductState.Error, (await f.TrackAsync(ProductSpecification.S101)).State);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Equal(2, f.Engine.Requests.Count);
        f.Packages.Replay[DpcRunFixture.Source] = package.ScanFromUtc;
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        f.Engine.FailDataset = null;
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(13), 2);
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.NotEqual(package.Id, f.Packages.Active[DpcRunFixture.Source].Id);
        Assert.Equal(4, f.Engine.Requests.Count);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S101)).State);
    }

    [Fact]
    public async Task CancellationAndRestartFinishTheNeverStartedMemberFromTheSameSnapshot() {
        var f = await DpcRunFixture.CreateAsync();
        using var cancellation = new CancellationTokenSource();
        f.Engine.DuringExport = _ => cancellation.Cancel();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => f.RunAsync(cancellation.Token));
        var package = Assert.Single(f.Packages.Active.Values);
        Assert.Equal(DpcRunFixture.Utc(8), await f.WatermarkAsync());
        Assert.Single(f.Packages.Replay);
        Assert.Equal(ProductState.ChangesDetected, (await f.TrackAsync(ProductSpecification.S57)).State);
        f.Engine.DuringExport = null;
        f.Clock.Now = DpcRunFixture.Utc(12);

        await f.RunAsync();

        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(1, f.SnapshotCalls);
        Assert.Equal(2, f.Engine.Requests.Count);
        Assert.Equal(package.DatasetYaml, f.Engine.Requests.Last().DatasetYaml);
        Assert.Equal(ProductState.ReadyForDistribution, (await f.TrackAsync(ProductSpecification.S57)).State);
        Assert.Equal(0, f.PublicationCalls);
        Assert.Empty(f.Packages.Replay);
    }

    [Fact]
    public async Task CancellationAfterPairedDiscardKeepsTheCumulativeBaselineForRestart() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var oldPackage = f.Packages.Active[DpcRunFixture.Source];
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 2);
        f.Clock.Now = DpcRunFixture.Utc(12);
        using var cancellation = new CancellationTokenSource();
        f.Packages.CancelAfterDiscard = cancellation;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => f.RunAsync(cancellation.Token));
        Assert.Empty(f.Packages.Active);
        Assert.Equal(oldPackage.ScanFromUtc, f.Packages.Replay[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
        f.Packages.CancelAfterDiscard = null;
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        var replacement = f.Packages.Active[DpcRunFixture.Source];
        Assert.Equal(oldPackage.ScanFromUtc, replacement.ScanFromUtc);
        Assert.Contains(DpcRunFixture.A, replacement.SummaryYaml);
        Assert.Contains(DpcRunFixture.B, replacement.SummaryYaml);
        Assert.Equal(4, f.Engine.Requests.Count);
    }

    [Theory]
    [InlineData("point")]
    [InlineData("curve")]
    [InlineData("featuretype")]
    [InlineData("informationtype")]
    public async Task DisabledRequiredArchivePreservesWatermarkCandidatesAndReplay(string disabledClass) {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(8);
        f.Archive.DisabledClass = disabledClass;
        f.Clock.Now = DpcRunFixture.Utc(12);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => f.RunAsync());
        Assert.Contains(disabledClass, error.Message);
        Assert.Contains("fixture.sde", error.Message);
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
        Assert.Equal(DpcRunFixture.Utc(8), f.Packages.Replay[DpcRunFixture.Source]);
        Assert.Equal(2, f.Engine.Requests.Count);
    }

    [Fact]
    public async Task FailedReplayInspectionDoesNotConsumeAnotherSourcesEmptyReplay() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.AddSource("101DK002", 1000);
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(7);
        f.Packages.Replay["101DK002"] = DpcRunFixture.Utc(9);
        f.Archive.FailFrom = DpcRunFixture.Utc(9);
        await Assert.ThrowsAsync<InvalidOperationException>(() => f.RunAsync());
        Assert.Equal(2, f.Packages.Replay.Count);
        Assert.Equal(DpcRunFixture.Utc(8), await f.WatermarkAsync());
        Assert.Empty(f.Packages.Active);
    }

    [Fact]
    public async Task ChangesAfterTheFixedCutoffWaitForTheNextInvocation() {
        var f = await DpcRunFixture.CreateAsync();
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 1);
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(11), 2);
        await f.RunAsync();
        var first = f.Packages.Active[DpcRunFixture.Source];
        Assert.Contains("A=1", first.DatasetYaml);
        Assert.Equal(DpcRunFixture.Utc(9), EncChangeSummary.GetLatestArchiveEditUtc(first.SummaryYaml));
        f.Clock.Now = DpcRunFixture.Utc(12);
        await f.RunAsync();
        Assert.NotEqual(first.Id, f.Packages.Active[DpcRunFixture.Source].Id);
        Assert.Contains("A=2", f.Packages.Active[DpcRunFixture.Source].DatasetYaml);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task EmptyReplayIsRetiredOnlyWhenEligible(bool held) {
        var f = await DpcRunFixture.CreateAsync();
        var track = await f.TrackAsync(ProductSpecification.S57);
        track.IsManuallyFrozen = held;
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(7);
        await f.RunAsync();
        Assert.Equal(held, f.Packages.Replay.ContainsKey(DpcRunFixture.Source));
        Assert.Empty(f.Packages.Active);
        Assert.Empty(f.Engine.Requests);
    }

    [Fact]
    public async Task ChangedPackageMappingCannotAuthorizeRecoveryOrDiscardOfAnotherMember() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        f.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 2);
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.MappingOverride = "OTHER";
        await Assert.ThrowsAsync<InvalidOperationException>(() => f.RunAsync());
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(0, f.Packages.PairedDiscards);
        Assert.Equal(DpcRunFixture.Utc(10), await f.WatermarkAsync());
    }

    [Fact]
    public async Task ConcurrentBuildLockProtectsBuildingCandidatesAndGlobalLockCoalescesScans() {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var package = f.Packages.Active[DpcRunFixture.Source];
        var track = await f.TrackAsync(ProductSpecification.S57);
        track.State = ProductState.Exporting;
        f.Packages.Replay[DpcRunFixture.Source] = DpcRunFixture.Utc(10);
        f.Clock.Now = DpcRunFixture.Utc(12);
        f.Locks.Busy.Add(ProductTrackLockKey.For(DpcRunFixture.S57, ProductSpecification.S57));
        await f.RunAsync();
        Assert.Same(package, f.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(ProductState.Exporting, track.State);
        Assert.Single(f.Packages.Replay);
        var scans = f.Archive.Scans.Count;
        f.Locks.Busy.Add("ENC-DPC-GLOBAL");
        f.Clock.Now = DpcRunFixture.Utc(14);
        await f.RunAsync();
        Assert.Equal(scans, f.Archive.Scans.Count);
        Assert.Equal(DpcRunFixture.Utc(12), await f.WatermarkAsync());
    }
}

/// <summary>Shares deterministic boundaries between coordinator scenarios; no CoreHost or live geodatabase is opened.</summary>
internal sealed class DpcRunFixture
{
    internal const string Source = "101DK001";
    internal const string S57 = "DK001";
    internal const string A = "10000000-0000-0000-0000-000000000001";
    internal const string B = "10000000-0000-0000-0000-000000000002";
    internal const string Outside = "10000000-0000-0000-0000-000000000003";
    internal static DateTime Utc(int hour) => new(2026, 10, 29, hour, 0, 0, DateTimeKind.Utc);
    internal readonly InMemoryProductRepository Workflow = new();
    internal readonly DpcClock Clock = new() { Now = Utc(10) };
    internal readonly DpcArchiveFixture Archive = new();
    internal readonly DpcLocks Locks = new();
    internal readonly Dictionary<string, int> PublishedEditions = new(StringComparer.OrdinalIgnoreCase) { [Source] = 0, [S57] = 4 };
    internal readonly Dictionary<string, string> PublishedYaml = new(StringComparer.OrdinalIgnoreCase);
    internal readonly DpcMemoryPackages Packages;
    internal readonly DpcEngine Engine;
    internal readonly IProductManager Manager;
    internal IConfiguration Configuration { get; set; } = new ConfigurationBuilder().Build();
    internal int SnapshotCalls;
    internal string? FailSnapshotSource;
    internal bool FailAllSnapshots;
    internal bool InvalidSnapshot;
    internal Action? BeforeSnapshot;
    internal int PublicationCalls;
    internal string? MappingOverride;
    internal readonly HashSet<Guid> PublishedPackageIds = [];

    internal int WholeArchiveReads;
    internal int DisposedHistoryReaders;
    internal readonly List<(DateTime From, DateTime Through)> HistoryBounds = [];
    internal readonly List<(DateTime From, string Source)> SourceArchiveReads = [];

    private DpcRunFixture(bool reusableArchive = false) {
        Packages = new(Workflow, Clock);
        Engine = new(Packages);
        Func<MethodInfo, object?[], object?> invoke = (method, args) => {
            var name = args.FirstOrDefault() as string ?? string.Empty;
            switch (method.Name) {
                case nameof(IArchiveScanSource.OpenArchiveScan):
                    HistoryBounds.Add(((DateTime)args[0]!, (DateTime)args[1]!));
                    return new FixtureHistoryReader(this, (DateTime)args[1]!);
                case nameof(IArchiveScanSource.ReadPendingEditsAsync):
                case nameof(IElectronicProductManager.GetPendingEditsAsync):
                    WholeArchiveReads++;
                    return Task.FromResult(Archive.Scan((DateTime)args[0]!, (DateTime)args[1]!));
                case nameof(IElectronicProductManager.GetMappedElectronicProducts):
                    IReadOnlyList<S100FC.S128.FeatureTypes.ElectronicProduct> mapped = [Product(MappingOverride ?? (name.StartsWith("101", StringComparison.Ordinal) ? name[3..] : "101" + name))];
                    return mapped;
                case nameof(IElectronicProductManager.ResolveExportProduct): return Product(name);
                case nameof(IElectronicProductManager.ReadElectronicProductVersionAsync):
                    return Task.FromResult<ElectronicProductVersion?>(new(name, PublishedEditions.GetValueOrDefault(name), 0));
                case nameof(IElectronicProductManager.CreateVerifiedExportSnapshotAsync):
                    SnapshotCalls++;
                    BeforeSnapshot?.Invoke();
                    if (name == FailSnapshotSource || FailAllSnapshots) {
                        if (InvalidSnapshot) return Task.FromResult(new VerifiedExportSnapshot(null!, []));
                        throw new ArgumentNullException("Geometry is null or empty");
                    }
                    var requested = (IReadOnlyCollection<string>)args[4]!;
                    return Task.FromResult(new VerifiedExportSnapshot(Archive.Snapshot(name, Clock.Now, (int)args[2]!),
                        requested.Where(id => Archive.IsEmitted(name, id, Clock.Now)).ToArray()));
                case nameof(IElectronicProductManager.GetLatestDatasetYAML):
                    return Task.FromResult((PublishedYaml[name], "index"));
                case nameof(IElectronicProductManager.PublishAcceptedEncPackageAsync):
                    PublicationCalls++;
                    PublishedPackageIds.Add(((EncPackagePublication)args[0]!).PackageId);
                    return Task.CompletedTask;
                case "get_OutputFolder": return "isolated-output";
                default: throw new NotSupportedException(method.Name);
            }
        };
        IElectronicProductManager products = reusableArchive
            ? DpcProxy<IReusableDpcTestProducts>.Create(invoke)
            : DpcProxy<IElectronicProductManager>.Create(invoke);
        Manager = new DpcManager(products);
    }

    internal static async Task<DpcRunFixture> CreateAsync(bool initializeCheckpoint = true, bool reusableArchive = false) {
        var f = new DpcRunFixture(reusableArchive);
        f.Archive.AddSource(Source, 1000);
        f.Archive.AddFeature(Source, A, 0);
        f.Archive.AddFeature(Source, B, 0);
        f.Archive.AddFeature(Source, Outside, 0, emitted: false);
        if (initializeCheckpoint)
            await f.Workflow.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), Utc(8));
        return f;
    }

    internal static async Task<DpcRunFixture> CreatedPackageAsync(bool includeB = false) {
        var f = await CreateAsync();
        f.Archive.Edit(Source, A, Utc(9), 1);
        if (includeB) f.Archive.Edit(Source, B, Utc(9), 1);
        await f.RunAsync();
        return f;
    }

    /// <summary>Exercises the manual coordinator against the same isolated boundaries as DPC.</summary>
    internal Task<Guid> ManualAsync() {
        var exports = new ExportOperationService(Manager, new ExportEngineRegistry([Engine]), Workflow, Engine, Clock, NullLogger<ExportOperationService>.Instance, Packages);
        return new EncPackageDetectionService(Workflow, Workflow, Packages, Manager, exports, Locks, Clock,
            NullLogger<EncPackageDetectionService>.Instance, Configuration).CreateManualAsync(Source, PublishedEditions[Source], 0, CancellationToken.None);
    }

    internal Task RunAsync(CancellationToken token = default) {
        var exports = new ExportOperationService(Manager, new ExportEngineRegistry([Engine]), Workflow, Engine, Clock, NullLogger<ExportOperationService>.Instance, Packages);
        return new EncPackageDetectionService(Workflow, Workflow, Packages, Manager, exports, Locks, Clock,
            NullLogger<EncPackageDetectionService>.Instance, Configuration).RunAsync(token);
    }

    internal Task<DateTime?> WatermarkAsync() => Workflow.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob));
    internal Task<ProductExportTrackRecord> TrackAsync(ProductSpecification spec) => Workflow.GetOrCreateTrackAsync(
        spec == ProductSpecification.S101 ? Source : S57, spec, ExportEngineKind.IsoIec8211, spec == ProductSpecification.S101 ? PublishedEditions[Source] : PublishedEditions[S57], 0);
    private static S100FC.S128.FeatureTypes.ElectronicProduct Product(string name) => new() {
        datasetName = name, productSpecification = new() { name = name.StartsWith("101", StringComparison.Ordinal) ? "S-101" : "S-57" }
    };
    /// <summary>Models the optional reader boundary while using the independent archive fixture for exact comparisons.</summary>
    private sealed class FixtureHistoryReader(DpcRunFixture fixture, DateTime throughUtc) : IArchiveChangeScan {
        /// <inheritdoc/>
        public Task<Dictionary<string, ArchiveRow>> ReadAsync(DateTime sinceUtc, string sourceName, CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            fixture.SourceArchiveReads.Add((sinceUtc, sourceName));
            return Task.FromResult(fixture.Archive.Scan(sinceUtc, throughUtc).GetValueOrDefault(sourceName) ?? new(StringComparer.OrdinalIgnoreCase));
        }
        /// <inheritdoc/>
        public ValueTask DisposeAsync() { fixture.DisposedHistoryReaders++; return ValueTask.CompletedTask; }
    }
    private sealed class DpcManager(IElectronicProductManager products) : IProductManager {
        public IElectronicProductManager ElectronicProductManager => products;
        public INauticalProductManager NauticalProductManager => throw new NotSupportedException();
    }
}

/// <summary>Allows the same coordinator fixture to opt into reusable archive reads without changing legacy-manager scenarios.</summary>
public interface IReusableDpcTestProducts : IElectronicProductManager, IArchiveScanSource { }

/// <summary>Strict proxy boundaries fail on unexpected publication, attachment or unbounded archive operations.</summary>
public class DpcProxy<T> : DispatchProxy where T : class
{
    private Func<MethodInfo, object?[], object?> _invoke = null!;
    public static T Create(Func<MethodInfo, object?[], object?> invoke) {
        var proxy = DispatchProxy.Create<T, DpcProxy<T>>();
        ((DpcProxy<T>)(object)proxy)._invoke = invoke;
        return proxy;
    }
    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => _invoke(targetMethod!, args ?? []);
}

internal sealed class DpcClock : TimeProvider
{
    internal DateTime Now { get; set; }
    public override DateTimeOffset GetUtcNow() => new(Now);
}

internal sealed class DpcLocks : IDatasetLockService
{
    internal Action<string>? OnAcquire { get; set; }
    internal HashSet<string> Busy { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        OnAcquire?.Invoke(datasetName);
        return Task.FromResult<IAsyncDisposable?>(Busy.Contains(datasetName) ? null : new Handle());
    }
    private sealed class Handle : IAsyncDisposable { public ValueTask DisposeAsync() => ValueTask.CompletedTask; }
}

/// <summary>Archive windows use the production endpoint composer, including intermediate changes that later revert.</summary>
internal sealed class DpcArchiveFixture
{
    private sealed record Version(ArchiveRow Row, ArchiveInterval Interval, bool Emitted);
    private sealed record AssociatedVersion(ArchiveRow Row, ArchiveInterval Interval);
    private readonly Dictionary<string, Dictionary<string, List<Version>>> _features = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<ArchiveBindingTarget, List<AssociatedVersion>> _associated = [];
    private readonly Dictionary<string, long> _scales = new(StringComparer.OrdinalIgnoreCase);
    internal List<(DateTime From, DateTime Through)> Scans { get; } = [];
    internal string? DisabledClass { get; set; }
    internal DateTime? FailFrom { get; set; }
    internal void AddSource(string name, long scale) { _features[name] = new(StringComparer.OrdinalIgnoreCase); _scales[name] = scale; }
    internal void ShareFeatures(string from, string to) => _features[to] = _features[from];
    internal void AddFeature(string source, string id, int value, bool emitted = true) => _features[source][id] = [new(Row(value, _scales[source]), new(DpcRunFixture.Utc(6), null), emitted)];
    internal void Edit(string source, string id, DateTime at, int value, long? scale = null) {
        var versions = _features[source][id];
        var last = versions[^1];
        versions[^1] = last with { Interval = last.Interval with { ToUtc = at } };
        var row = Row(value, scale ?? last.Row.NominalScale!.Value);
        row.InformationBindings = last.Row.InformationBindings;
        row.FeatureBindings = last.Row.FeatureBindings;
        versions.Add(new(row, new(at, null), last.Emitted));
    }
    private static ArchiveRow Row(int value, long scale) => new() { Code = "DepthContour", AttributeBindings = $"{{\"valueOfDepthContour\":{value}}}", NominalScale = scale };
    private Version? At(string source, string id, DateTime at) => _features[source][id].SingleOrDefault(v => v.Interval.Contains(at));
    internal void AddAssociated(string id, ArchiveBindingKind kind, int value) =>
        _associated[new(kind, Guid.Parse(id))] = [new(AssociatedRow(kind, value), new(DpcRunFixture.Utc(6), null))];
    internal void EditAssociated(string id, DateTime at, int value) {
        var target = _associated.Keys.Single(target => target.Id == Guid.Parse(id));
        var versions = _associated[target];
        versions[^1] = versions[^1] with { Interval = versions[^1].Interval with { ToUtc = at } };
        versions.Add(new(AssociatedRow(target.Kind, value), new(at, null)));
    }
    internal void DeleteAssociated(string id, DateTime at) {
        var versions = _associated.Single(pair => pair.Key.Id == Guid.Parse(id)).Value;
        versions[^1] = versions[^1] with { Interval = versions[^1].Interval with { ToUtc = at } };
    }
    internal void Bind(string source, string ownerId, string targetId) {
        var target = _associated.Keys.Single(target => target.Id == Guid.Parse(targetId));
        var row = _features[source][ownerId][0].Row;
        if (target.Kind == ArchiveBindingKind.Information) row.InformationBindings = ArchiveBindingIndexTests.Json(target);
        else row.FeatureBindings = ArchiveBindingIndexTests.Json(target);
    }
    private static ArchiveRow AssociatedRow(ArchiveBindingKind kind, int value) => new() {
        Code = kind == ArchiveBindingKind.Information ? "SpatialQuality" : "NauticalInformation", AttributeBindings = $"{{\"value\":{value}}}"
    };
    internal bool IsEmitted(string source, string id, DateTime at) {
        if (_features[source].ContainsKey(id))
            return At(source, id, at) is { Emitted: true } version && version.Row.NominalScale == _scales[source];
        var target = _associated.Keys.SingleOrDefault(target => target.Id == Guid.Parse(id));
        if (!_associated.TryGetValue(target, out var versions) || !versions.Any(version => version.Interval.Contains(at)))
            return false;
        var index = new ArchiveBindingIndex([target], new(at, at));
        foreach (var owner in _features[source].Values.SelectMany(versions => versions).Where(version => version.Emitted))
            index.AddOwner(owner.Interval, owner.Row.InformationBindings, owner.Row.FeatureBindings,
                () => owner.Row.NominalScale == _scales[source] ? [source] : []);
        return index.IsCurrent(source, target);
    }
    internal Dictionary<string, Dictionary<string, ArchiveRow>> Scan(DateTime from, DateTime through) {
        Scans.Add((from, through));
        foreach (var name in ArchiveScanRequirements.Classes) ArchiveScanRequirements.Verify("fixture.sde", name, name != DisabledClass);
        if (from == FailFrom) throw new InvalidOperationException("Archive inspection failed");
        var window = new ArchiveScanWindow(from, through);
        var result = new Dictionary<string, Dictionary<string, ArchiveRow>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (source, features) in _features) {
            foreach (var (id, versions) in features) {
                if (!versions.Any(v => v.Interval.LatestEvent(window).HasValue && v.Row.NominalScale == _scales[source])) continue;
                var endpoints = window.Compose(versions, v => v.Interval);
                var row = ArchiveChangeComposer.Compose(endpoints.Before?.Row, endpoints.After?.Row, endpoints.Latest.Row, endpoints.LatestEditUtc, false);
                row.CurrentInProduct = endpoints.After?.Row.NominalScale == _scales[source];
                if (!result.TryGetValue(source, out var rows)) result[source] = rows = new(StringComparer.OrdinalIgnoreCase);
                rows[id] = row;
            }
        }
        var changedTargets = _associated.Where(pair => pair.Value.Any(version => version.Interval.LatestEvent(window).HasValue)).ToDictionary(pair => pair.Key, pair => pair.Value);
        if (changedTargets.Count > 0) {
            var index = new ArchiveBindingIndex(changedTargets.Keys, window);
            foreach (var (source, features) in _features) {
                foreach (var owner in features.Values.SelectMany(versions => versions))
                    index.AddOwner(owner.Interval, owner.Row.InformationBindings, owner.Row.FeatureBindings,
                        () => owner.Row.NominalScale == _scales[source] ? [source] : []);
            }
            foreach (var (source, targets) in index.Affected) {
                if (!result.TryGetValue(source, out var rows)) result[source] = rows = new(StringComparer.OrdinalIgnoreCase);
                foreach (var target in targets) {
                    var endpoints = window.Compose(changedTargets[target], version => version.Interval);
                    var row = ArchiveChangeComposer.Compose(endpoints.Before?.Row, endpoints.After?.Row, endpoints.Latest.Row, endpoints.LatestEditUtc, false);
                    row.CurrentInProduct = index.IsCurrent(source, target) && !row.Deleted;
                    rows[target.SourceId] = row;
                }
            }
        }
        return result;
    }
    internal YamlDataset Snapshot(string source, DateTime at, int edition) {
        var dataset = new YamlDataset { CellName = source + ".000", Edition = (uint)edition,
            Comment = string.Join(";", new[] { (DpcRunFixture.A, "A"), (DpcRunFixture.B, "B") }.Where(p => _features[source].ContainsKey(p.Item1)).Select(p => p.Item2 + "=" + System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(At(source, p.Item1, at)!.Row.AttributeBindings!)!["valueOfDepthContour"])) };
        foreach (var id in _features[source].Keys.Where(id => IsEmitted(source, id, at)))
            dataset.AddFeature(new Feature { Name = "DepthContour", Prim = Primitive.Point, Foid = TopologyFeatureMapping.CreateFoid(id), Geometry = "P" + Guid.Parse(id).ToStableUInt64() });
        foreach (var (target, versions) in _associated.Where(pair => IsEmitted(source, pair.Key.SourceId, at))) {
            var row = versions.Single(version => version.Interval.Contains(at)).Row;
            dataset.Comment += ";" + target.SourceId + "=" + System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(row.AttributeBindings!)!["value"];
            if (target.Kind == ArchiveBindingKind.Information)
                dataset.AddInformation(new Information { Name = row.Code, ID = target.Id.ToStableUInt64().ToString() });
            else
                dataset.AddFeature(new Feature { Name = row.Code, Prim = Primitive.NoGeometry, Foid = TopologyFeatureMapping.CreateFoid(target.SourceId) });
        }
        return dataset;
    }
}

/// <summary>SQL transaction tests separately verify these paired mutations using real migrations and SQL Server.</summary>
internal sealed class DpcMemoryPackages(InMemoryProductRepository workflows, DpcClock clock) : IEncPackageRepository
{
    /// <inheritdoc/>
    public Task<IReadOnlyList<string>> GetSourceNamesBeforeBaselineAsync(DateTime baselineUtc, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<string>>(Active.Values.Where(package => package.ScanFromUtc < baselineUtc).Select(package => package.SourceDatasetName).ToArray());

    /// <inheritdoc/>
    public Task RebaseReplayAsync(DateTime baselineUtc, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        foreach (var source in Replay.Keys.ToArray())
            if (Replay[source] < baselineUtc) { Replay[source] = baselineUtc; SnapshotAttempts.Remove(source); }
        foreach (var source in SnapshotAttempts.Keys.ToArray())
            if (SnapshotAttempts[source] < baselineUtc) SnapshotAttempts.Remove(source);
        return Task.CompletedTask;
    }

    internal Dictionary<string, string> AcknowledgedYaml { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Task<string?> GetAcknowledgedSourceYamlAsync(string sourceName, CancellationToken cancellationToken = default) => Task.FromResult(AcknowledgedYaml.GetValueOrDefault(sourceName));
    internal Dictionary<string, DateTime> Acknowledged { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Task<IReadOnlyDictionary<string, DateTime>> GetFailureAcknowledgementBoundsAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyDictionary<string, DateTime>>(new Dictionary<string, DateTime>(Acknowledged));

    internal Dictionary<string, DateTime> SnapshotAttempts { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Task<IReadOnlyDictionary<string, DateTime>> GetSnapshotAttemptBoundsAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyDictionary<string, DateTime>>(new Dictionary<string, DateTime>(SnapshotAttempts));
    public async Task MarkSnapshotAttemptAsync(string sourceDatasetName, DateTime scanFromUtc, DateTime attemptedThroughUtc, CancellationToken cancellationToken = default) {
        await MarkReplayAsync(sourceDatasetName, scanFromUtc, cancellationToken);
        if (!SnapshotAttempts.TryGetValue(sourceDatasetName, out var previous) || previous < attemptedThroughUtc)
            SnapshotAttempts[sourceDatasetName] = attemptedThroughUtc;
    }
    internal Dictionary<string, EncPackage> Active { get; } = new(StringComparer.OrdinalIgnoreCase);
    internal Dictionary<string, DateTime> Replay { get; } = new(StringComparer.OrdinalIgnoreCase);
    internal Dictionary<string, string> Delivery { get; } = new(StringComparer.OrdinalIgnoreCase);
    internal int PairedDiscards { get; private set; }
    internal CancellationTokenSource? CancelAfterDiscard { get; set; }
    public Task<EncPackage?> GetByIdAsync(Guid packageId, CancellationToken cancellationToken = default) => Task.FromResult(Active.Values.SingleOrDefault(p => p.Id == packageId));
    public Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames, CancellationToken cancellationToken = default, bool includeSourceYaml = true) =>
        Task.FromResult<IReadOnlyDictionary<string, EncPackage>>(Active.Where(p => sourceDatasetNames.Contains(p.Key, StringComparer.OrdinalIgnoreCase)).ToDictionary(p => p.Key, p => p.Value, StringComparer.OrdinalIgnoreCase));
    public Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default) => Task.FromResult(Replay.Count == 0 ? null : (DateTime?)Replay.Values.Min());
    public Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyDictionary<string, DateTime>>(new Dictionary<string, DateTime>(Replay));
    public Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken = default) { Replay[sourceDatasetName] = Replay.TryGetValue(sourceDatasetName, out var old) && old < scanFromUtc ? old : scanFromUtc; return Task.CompletedTask; }
    public Task ClearReplayAsync(string sourceDatasetName, CancellationToken cancellationToken = default) { Replay.Remove(sourceDatasetName); SnapshotAttempts.Remove(sourceDatasetName); return Task.CompletedTask; }
    public Task RetireReplayAsync(string sourceDatasetName, DateTime expectedScanFromUtc, CancellationToken cancellationToken = default) {
        if (Replay.TryGetValue(sourceDatasetName, out var current) && current == expectedScanFromUtc) { Replay.Remove(sourceDatasetName); SnapshotAttempts.Remove(sourceDatasetName); }
        return Task.CompletedTask;
    }
    public Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default) { cancellationToken.ThrowIfCancellationRequested(); var added = Active.TryAdd(package.SourceDatasetName, package); if (added && Replay.TryGetValue(package.SourceDatasetName, out var bound) && bound >= package.ScanFromUtc) { Replay.Remove(package.SourceDatasetName); SnapshotAttempts.Remove(package.SourceDatasetName); } return Task.FromResult(added); }
    public async Task<bool> TryCreatePendingAsync(EncPackage package, CancellationToken cancellationToken = default) {
        foreach (var (name, spec) in new[] { (package.SourceDatasetName, ProductSpecification.S101), (package.S57DatasetName, ProductSpecification.S57) }) {
            var track = await workflows.GetTrackAsync(name, spec, cancellationToken);
            if (track is null || track.IsManuallyFrozen || track.State is not (ProductState.Idle or ProductState.ChangesDetected) || track.CandidateEdition.HasValue || track.CandidateUpdate.HasValue) return false;
        }
        if (!await TryCreateAsync(package, cancellationToken)) return false;
        return await TryQueueMissingMembersAsync(package.Id, package.DetectedAtUtc, cancellationToken);
    }
    public async Task<IReadOnlyList<string>> GetIncompleteSourceNamesAsync(CancellationToken cancellationToken = default) {
        var names = new List<string>();
        foreach (var package in Active.Values) {
            var s101 = await workflows.GetTrackAsync(package.SourceDatasetName, ProductSpecification.S101, cancellationToken);
            var s57 = await workflows.GetTrackAsync(package.S57DatasetName, ProductSpecification.S57, cancellationToken);
            if ((!package.S101Discarded && (s101 is null || s101.State is ProductState.Idle or ProductState.ChangesDetected or ProductState.Exporting or ProductState.Validating)) ||
                (!package.S57Discarded && (s57 is null || s57.State is ProductState.Idle or ProductState.ChangesDetected or ProductState.Exporting or ProductState.Validating))) names.Add(package.SourceDatasetName);
        }
        return names;
    }
    public async Task<bool> TryQueueMissingMembersAsync(Guid packageId, DateTime nowUtc, CancellationToken cancellationToken = default) {
        if (!await CanRefreshAsync(packageId, cancellationToken)) return false;
        var package = (await GetByIdAsync(packageId, cancellationToken))!;
        if (package.S57Discarded || package.S101Discarded) return false;
        foreach (var (name, spec) in new[] { (package.SourceDatasetName, ProductSpecification.S101), (package.S57DatasetName, ProductSpecification.S57) }) {
            var track = (await workflows.GetTrackAsync(name, spec, cancellationToken))!;
            if (track.State is not (ProductState.Idle or ProductState.ChangesDetected) || track.CandidateEdition.HasValue) continue;
            track.CandidatePreviousState ??= track.State;
            await workflows.SetStateAsync(track.Id, ProductState.ChangesDetected, "system", nowUtc, cancellationToken: cancellationToken);
            await MarkReplayAsync(package.SourceDatasetName, package.ScanFromUtc, cancellationToken);
        }
        return true;
    }
    public Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default) { Active.Values.Single(p => p.Id == packageId).ErrorMessage = message; return Task.CompletedTask; }
    public Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default, bool preserveScanBound = false) => throw new InvalidOperationException("The detector must discard both members atomically.");
    public Task<EncPackageDiscardResult> TryDiscardPackageAsync(Guid expectedPackageId, string actor, DateTime nowUtc, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public async Task<bool> CanRefreshAsync(Guid expectedPackageId, CancellationToken cancellationToken = default) {
        var package = await GetByIdAsync(expectedPackageId, cancellationToken);
        if (package is null || package.ErrorMessage == EncPackageFailureRules.SendFailureMessage) return false;
        foreach (var (name, spec) in new[] { (package.SourceDatasetName, ProductSpecification.S101), (package.S57DatasetName, ProductSpecification.S57) }) {
            var track = await workflows.GetTrackAsync(name, spec, cancellationToken);
            if (track is null || track.IsManuallyFrozen || EncPackageDetectionService.IsRefreshBlocked(track)) return false;
            if (Delivery.TryGetValue(name, out var status) && status != "NotDelivered" && !(status == "Rejected" && track.State == ProductState.Rejected)) return false;
        }
        return true;
    }
    public async Task<EncPackageDiscardResult> TryDiscardForRefreshAsync(Guid expectedPackageId, DateTime nowUtc, CancellationToken cancellationToken = default) {
        if (!await CanRefreshAsync(expectedPackageId, cancellationToken)) return new(EncPackageDiscardStatus.Conflict, []);
        var package = (await GetByIdAsync(expectedPackageId, cancellationToken))!;
        foreach (var (name, spec) in new[] { (package.SourceDatasetName, ProductSpecification.S101), (package.S57DatasetName, ProductSpecification.S57) }) {
            var track = (await workflows.GetTrackAsync(name, spec, cancellationToken))!;
            if (track.CandidateEdition.HasValue || track.State is ProductState.Error or ProductState.Rejected)
                await workflows.DiscardCandidateAsync(track.Id, "system", clock.Now, cancellationToken);
            else if (track.State == ProductState.ChangesDetected) {
                track.State = ProductCandidateRecovery.RestoredState(track.CandidatePreviousState);
                track.CandidatePreviousState = null;
            }
            Delivery.Remove(name); // Test boundary models a new exact revision; SQL preserves the old evidence.
        }
        Active.Remove(package.SourceDatasetName);
        await MarkReplayAsync(package.SourceDatasetName, package.ScanFromUtc, cancellationToken);
        PairedDiscards++;
        CancelAfterDiscard?.Cancel();
        return new(EncPackageDiscardStatus.Discarded, []);
    }
}

internal sealed class DpcEngine(DpcMemoryPackages packages) : IExportEngine, ISevenCsService
{
    public ExportEngineKind Kind => ExportEngineKind.IsoIec8211;
    internal List<ExportEngineRequest> Requests { get; } = [];
    internal string? FailDataset { get; set; }
    internal Action<ExportEngineRequest>? DuringExport { get; set; }
    internal int ValidationErrors { get; set; }
    internal string? CriticalDataset { get; set; }
    public bool Supports(ProductSpecification productSpecification) => productSpecification is ProductSpecification.S101 or ProductSpecification.S57;
    internal Func<ExportEngineRequest, Task>? ObserveExport { get; set; }
    public async Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) {
        Assert.Contains(packages.Active.Values, package => package.DatasetYaml == request.DatasetYaml);
        Requests.Add(request);
        DuringExport?.Invoke(request);
        if (ObserveExport is not null) await ObserveExport(request);
        cancellationToken.ThrowIfCancellationRequested();
        if (request.DatasetName == FailDataset) throw new InvalidOperationException("Compiler fixture failure");
        return new ExportEngineResult("isolated-output", []);
    }
    public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default) => ValidateDatasetAsync(datasetName, ProductSpecification.S101, edition, update, outputPath, cancellationToken);
    public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, ProductSpecification productSpecification, int edition, int update, string outputPath, CancellationToken cancellationToken = default) => Task.FromResult(new SevenCsValidationResult(new SummaryResponse { Critical = datasetName == CriticalDataset ? 2 : 0, Errors = ValidationErrors }, [new("test.vld", "text/plain", "fixture diagnostics"u8.ToArray())]));
}
