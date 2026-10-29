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
using S100FC.YAML;
using System.Reflection;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI;

/// <summary>Runs the real detector and export service with bounded archive versions and isolated persistence/encoder boundaries.</summary>
public sealed class DpcRunAsyncTests
{
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

    [Theory]
    [InlineData(ProductState.ReadyForDistribution)]
    [InlineData(ProductState.Error)]
    [InlineData(ProductState.Rejected)]
    public async Task LaterRelevantEditReplacesBothEligibleCandidatesAndRetainsBaseline(ProductState state) {
        var f = await DpcRunFixture.CreatedPackageAsync();
        var previous = f.Packages.Active[DpcRunFixture.Source];
        var track = await f.TrackAsync(ProductSpecification.S57);
        track.State = state;
        if (state == ProductState.Rejected) f.Packages.Delivery[DpcRunFixture.S57] = "Rejected";
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
            Assert.Contains("$nominalscale", package.SummaryYaml);
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
    internal int SnapshotCalls;
    internal int PublicationCalls;
    internal string? MappingOverride;
    internal readonly HashSet<Guid> PublishedPackageIds = [];

    private DpcRunFixture() {
        Packages = new(Workflow, Clock);
        Engine = new(Packages);
        var products = DpcProxy<IElectronicProductManager>.Create((method, args) => {
            var name = args.FirstOrDefault() as string ?? string.Empty;
            switch (method.Name) {
                case nameof(IElectronicProductManager.GetPendingEditsAsync):
                    return Task.FromResult(Archive.Scan((DateTime)args[0]!, (DateTime)args[1]!));
                case nameof(IElectronicProductManager.GetMappedElectronicProducts):
                    IReadOnlyList<S100FC.S128.FeatureTypes.ElectronicProduct> mapped = [Product(MappingOverride ?? (name.StartsWith("101", StringComparison.Ordinal) ? name[3..] : "101" + name))];
                    return mapped;
                case nameof(IElectronicProductManager.ResolveExportProduct): return Product(name);
                case nameof(IElectronicProductManager.ReadElectronicProductVersionAsync):
                    return Task.FromResult<ElectronicProductVersion?>(new(name, PublishedEditions.GetValueOrDefault(name), 0));
                case nameof(IElectronicProductManager.CreateVerifiedExportSnapshotAsync):
                    SnapshotCalls++;
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
        });
        Manager = new DpcManager(products);
    }

    internal static async Task<DpcRunFixture> CreateAsync() {
        var f = new DpcRunFixture();
        f.Archive.AddSource(Source, 1000);
        f.Archive.AddFeature(Source, A, 0);
        f.Archive.AddFeature(Source, B, 0);
        f.Archive.AddFeature(Source, Outside, 0, emitted: false);
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

    internal Task RunAsync(CancellationToken token = default) {
        var exports = new ExportOperationService(Manager, new ExportEngineRegistry([Engine]), Workflow, Engine, Clock, NullLogger<ExportOperationService>.Instance, Packages);
        return new EncPackageDetectionService(Workflow, Workflow, Packages, Manager, exports, Locks, Clock,
            NullLogger<EncPackageDetectionService>.Instance, new ConfigurationBuilder().Build()).RunAsync(token);
    }

    internal Task<DateTime?> WatermarkAsync() => Workflow.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob));
    internal Task<ProductExportTrackRecord> TrackAsync(ProductSpecification spec) => Workflow.GetOrCreateTrackAsync(
        spec == ProductSpecification.S101 ? Source : S57, spec, ExportEngineKind.IsoIec8211, spec == ProductSpecification.S101 ? PublishedEditions[Source] : PublishedEditions[S57], 0);
    private static S100FC.S128.FeatureTypes.ElectronicProduct Product(string name) => new() {
        datasetName = name, productSpecification = new() { name = name.StartsWith("101", StringComparison.Ordinal) ? "S-101" : "S-57" }
    };
    private sealed class DpcManager(IElectronicProductManager products) : IProductManager {
        public IElectronicProductManager ElectronicProductManager => products;
        public INauticalProductManager NauticalProductManager => throw new NotSupportedException();
    }
}

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
    internal HashSet<string> Busy { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<IAsyncDisposable?>(Busy.Contains(datasetName) ? null : new Handle());
    }
    private sealed class Handle : IAsyncDisposable { public ValueTask DisposeAsync() => ValueTask.CompletedTask; }
}

/// <summary>Archive windows use the production endpoint composer, including intermediate changes that later revert.</summary>
internal sealed class DpcArchiveFixture
{
    private sealed record Version(ArchiveRow Row, ArchiveInterval Interval, bool Emitted);
    private readonly Dictionary<string, Dictionary<string, List<Version>>> _features = new(StringComparer.OrdinalIgnoreCase);
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
        versions.Add(new(Row(value, scale ?? last.Row.NominalScale!.Value), new(at, null), last.Emitted));
    }
    private static ArchiveRow Row(int value, long scale) => new() { Code = "DepthContour", AttributeBindings = $"{{\"valueOfDepthContour\":{value}}}", NominalScale = scale };
    private Version? At(string source, string id, DateTime at) => _features[source][id].SingleOrDefault(v => v.Interval.Contains(at));
    internal bool IsEmitted(string source, string id, DateTime at) => _features[source].ContainsKey(id) && At(source, id, at) is { Emitted: true } version && version.Row.NominalScale == _scales[source];
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
        return result;
    }
    internal YamlDataset Snapshot(string source, DateTime at, int edition) {
        var dataset = new YamlDataset { CellName = source + ".000", Edition = (uint)edition,
            Comment = string.Join(";", new[] { (DpcRunFixture.A, "A"), (DpcRunFixture.B, "B") }.Where(p => _features[source].ContainsKey(p.Item1)).Select(p => p.Item2 + "=" + System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(At(source, p.Item1, at)!.Row.AttributeBindings!)!["valueOfDepthContour"])) };
        foreach (var id in _features[source].Keys.Where(id => IsEmitted(source, id, at)))
            dataset.AddFeature(new Feature { Name = "DepthContour", Prim = Primitive.Point, Foid = TopologyFeatureMapping.CreateFoid(id), Geometry = "P" + Guid.Parse(id).ToStableUInt64() });
        return dataset;
    }
}

/// <summary>SQL transaction tests separately verify these paired mutations using real migrations and SQL Server.</summary>
internal sealed class DpcMemoryPackages(InMemoryProductRepository workflows, DpcClock clock) : IEncPackageRepository
{
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
    public Task ClearReplayAsync(string sourceDatasetName, CancellationToken cancellationToken = default) { Replay.Remove(sourceDatasetName); return Task.CompletedTask; }
    public Task RetireReplayAsync(string sourceDatasetName, DateTime expectedScanFromUtc, CancellationToken cancellationToken = default) {
        if (Replay.TryGetValue(sourceDatasetName, out var current) && current == expectedScanFromUtc) Replay.Remove(sourceDatasetName);
        return Task.CompletedTask;
    }
    public Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default) { cancellationToken.ThrowIfCancellationRequested(); var added = Active.TryAdd(package.SourceDatasetName, package); if (added && Replay.TryGetValue(package.SourceDatasetName, out var bound) && bound >= package.ScanFromUtc) Replay.Remove(package.SourceDatasetName); return Task.FromResult(added); }
    public Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default) { Active.Values.Single(p => p.Id == packageId).ErrorMessage = message; return Task.CompletedTask; }
    public Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default, bool preserveScanBound = false) => throw new InvalidOperationException("The detector must discard both members atomically.");
    public Task<EncPackageDiscardResult> TryDiscardPackageAsync(Guid expectedPackageId, string actor, DateTime nowUtc, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public async Task<bool> CanRefreshAsync(Guid expectedPackageId, CancellationToken cancellationToken = default) {
        var package = await GetByIdAsync(expectedPackageId, cancellationToken);
        if (package is null) return false;
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
    public Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) {
        Assert.Contains(packages.Active.Values, package => package.DatasetYaml == request.DatasetYaml);
        Requests.Add(request);
        DuringExport?.Invoke(request);
        cancellationToken.ThrowIfCancellationRequested();
        if (request.DatasetName == FailDataset) throw new InvalidOperationException("Compiler fixture failure");
        return Task.FromResult(new ExportEngineResult("isolated-output", []));
    }
    public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default) => ValidateDatasetAsync(datasetName, ProductSpecification.S101, edition, update, outputPath, cancellationToken);
    public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, ProductSpecification productSpecification, int edition, int update, string outputPath, CancellationToken cancellationToken = default) => Task.FromResult(new SevenCsValidationResult(new SevenCsService.SummaryResponse { Critical = datasetName == CriticalDataset ? 2 : 0, Errors = ValidationErrors }, [new("test.vld", "text/plain", "fixture diagnostics"u8.ToArray())]));
}
