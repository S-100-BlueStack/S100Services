using ProductCatalogueAPI.Data.Models;

namespace TestProductCatalogueAPI;

public sealed class ProductCandidateRecoveryTests
{
    [Theory]
    [InlineData(ProductState.ReadyForDistribution, true, true)]
    [InlineData(ProductState.Error, true, true)]
    [InlineData(ProductState.Error, false, true)]
    [InlineData(ProductState.Rejected, false, false)]
    [InlineData(ProductState.ReadyForDistribution, false, false)]
    [InlineData(ProductState.Exporting, true, false)]
    [InlineData(ProductState.Validating, true, false)]
    [InlineData(ProductState.InTransit, true, false)]
    [InlineData(ProductState.Published, true, false)]
    public void OnlyFinalUnsentCandidatesMayBeDiscarded(ProductState state, bool candidate, bool expected) {
        Assert.Equal(expected, ProductCandidateRecovery.CanDiscard(state, ProductState.Idle,
            candidate ? 5 : null, candidate ? 0 : null));
    }

    [Theory]
    [InlineData(ProductState.Error)]
    [InlineData(ProductState.Rejected)]
    [InlineData(ProductState.InTransit)]
    [InlineData(ProductState.ReadyForDistribution)]
    [InlineData(ProductState.AcceptedForDistribution)]
    [InlineData(ProductState.Published)]
    [InlineData(ProductState.Frozen)]
    public void PreviousSubmittedOrFailedStatesNeverAuthorizeUnsafeRestore(ProductState previous) {
        if (previous is ProductState.Error or ProductState.Rejected) {
            Assert.Equal(ProductState.Idle, ProductCandidateRecovery.RestoredState(previous));
        } else {
            Assert.False(ProductCandidateRecovery.CanDiscard(ProductState.Error, previous, 5, 0));
        }
    }

    [Fact]
    public void InitialFailureAndSubsequentRetryRestoreIdleInsteadOfError() {
        Assert.Equal(ProductState.Idle, ProductCandidateRecovery.PreviousStateForReplacement(ProductState.Error, null));
        Assert.Equal(ProductState.Idle, ProductCandidateRecovery.PreviousStateForReplacement(ProductState.Error, ProductState.Error));
        Assert.Equal(ProductState.ChangesDetected, ProductCandidateRecovery.PreviousStateForReplacement(ProductState.Error, ProductState.ChangesDetected));
    }

    [Fact]
    public void PartialCandidateVersionIsNeverDiscardEligible() {
        Assert.False(ProductCandidateRecovery.CanDiscard(ProductState.Error, null, 5, null));
        Assert.False(ProductCandidateRecovery.CanDiscard(ProductState.Error, null, null, 0));
    }
}
