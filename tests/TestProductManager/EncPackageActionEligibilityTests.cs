using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogueAPI;

public sealed class EncPackageActionEligibilityTests
{
    private static ProductExportTrackRecord Track(ProductState state, bool hasCandidate = true, bool frozen = false) => new() {
        State = state, IsManuallyFrozen = frozen,
        CandidateEdition = hasCandidate ? 1 : null,
        CandidateUpdate = hasCandidate ? 0 : null
    };

    [Theory]
    [InlineData(ProductState.ReadyForDistribution, ProductState.ReadyForDistribution, true)]
    [InlineData(ProductState.Error, ProductState.Rejected, true)]
    [InlineData(ProductState.ReadyForDistribution, ProductState.Error, true)]
    [InlineData(ProductState.Exporting, ProductState.ReadyForDistribution, false)]
    [InlineData(ProductState.Validating, ProductState.Error, false)]
    [InlineData(ProductState.InTransit, ProductState.Error, false)]
    [InlineData(ProductState.AcceptedForDistribution, ProductState.Error, false)]
    [InlineData(ProductState.Published, ProductState.ReadyForDistribution, false)]
    public void PauseRequiresTwoFinalUnsentMembers(ProductState left, ProductState right, bool expected)
    {
        Assert.Equal(expected, EncPackageActionEligibility.CanActOnUnsentPackage(Track(left), Track(right)));
    }

    [Fact]
    public void MissingProductTrackIsReadableButCannotAuthorizePackageMutations()
    {
        var package = new EncPackage();
        var completed = Track(ProductState.Error);
        Assert.False(EncPackageActionEligibility.CanActOnUnsentPackage(completed, null));
        Assert.False(EncPackageActionEligibility.CanActOnUnsentPackage(null, completed));
        Assert.False(EncPackageActionEligibility.CanDiscard(package, completed, null));
        Assert.False(EncPackageActionEligibility.CanDiscard(package, null, completed));
    }

    [Fact]
    public void ManualProductHoldPreventsPackageAction()
    {
        Assert.False(EncPackageActionEligibility.CanActOnUnsentPackage(
            Track(ProductState.Error, frozen: true), Track(ProductState.ReadyForDistribution)));
    }

    [Fact]
    public void DiscardUsesTheWholePackageAndRequiresAtLeastOneCandidate()
    {
        var package = new EncPackage { S101Discarded = true };
        Assert.True(EncPackageActionEligibility.CanDiscard(package,
            Track(ProductState.Idle, hasCandidate: false), Track(ProductState.Error)));
        Assert.True(EncPackageActionEligibility.CanDiscard(package,
            Track(ProductState.Error, hasCandidate: false), Track(ProductState.ReadyForDistribution)));
        package.S57Discarded = true;
        Assert.False(EncPackageActionEligibility.CanDiscard(package,
            Track(ProductState.Error), Track(ProductState.Error)));
    }
}

public sealed class EncPackageActionsReadContractTests
{
    [Fact]
    public async Task MissingActionSnapshotReturnsDisabledReadWithoutMutationPermission()
    {
        var result = await new EncPackageActionsController(new NoPackageActions())
            .GetActions("101DK001OSTSO", CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.False((bool)ok.Value!.GetType().GetProperty("actionsAvailable")!.GetValue(ok.Value)!);
    }

    private sealed class NoPackageActions : IEncPackageActionService
    {
        public bool Enabled => true;
        public Task<EncPackageActionSnapshot?> ReadAsync(string sourceName, CancellationToken cancellationToken = default) =>
            Task.FromResult<EncPackageActionSnapshot?>(null);
        public Task<EncPackagePauseWriteResult> SetPausedAsync(string sourceName, Guid packageId,
            byte[]? expectedVersion, bool paused, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("A missing package cannot be mutated.");
        public Task<string?> QueueDiscardAsync(string sourceName, Guid packageId,
            CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("A missing package cannot be discarded.");
    }
}
