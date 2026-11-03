using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Models;

namespace TestProductCatalogueAPI;

/// <summary>Checks the five-state package contract independently of detailed candidate lifecycle states.</summary>
public sealed class EncPackageSimplifiedStatusTests
{
    /// <summary>No build, rejection, accepted or published label is exposed as a package status.</summary>
    [Fact]
    public void PackageContractHasExactlyFiveStates() {
        Assert.Equal(new[] { "Error", "Hold", "Idle", "InTransit", "Ready" }, Enum.GetNames<EncPackageStatus>().OrderBy(name => name).ToArray());
        Assert.Equal(0, (int)EncPackageStatus.Idle);
        Assert.Equal(2, (int)EncPackageStatus.Ready);
        Assert.Equal(3, (int)EncPackageStatus.InTransit);
        Assert.Equal(4, (int)EncPackageStatus.Error);
        Assert.Equal(5, (int)EncPackageStatus.Hold);
    }

    /// <summary>Progress stays on the member while the package uses a simplified state.</summary>
    [Theory]
    [InlineData(ProductState.ChangesDetected, EncPackageStatus.Idle)]
    [InlineData(ProductState.Exporting, EncPackageStatus.Idle)]
    [InlineData(ProductState.Validating, EncPackageStatus.Idle)]
    [InlineData(ProductState.AcceptedForDistribution, EncPackageStatus.InTransit)]
    [InlineData(ProductState.Published, EncPackageStatus.Idle)]
    [InlineData(ProductState.Cancelled, EncPackageStatus.Idle)]
    public void DetailedStatesUseTheSimplifiedPresentation(ProductState state, EncPackageStatus expected) {
        var candidate = new ProductExportTrackRecord { State = state };
        var ready = new ProductExportTrackRecord { State = ProductState.ReadyForDistribution };
        Assert.Equal(expected, EncPackageStatusResolver.Resolve(new(), candidate, ready));
        Assert.Equal(expected, EncPackageStatusResolver.Resolve(new(), ready, candidate));
        Assert.Equal(expected, EncPackageStatusResolver.Resolve(new(), candidate, candidate));
        Assert.Equal(state, candidate.State);
    }

    /// <summary>Any rejection is explicit in the package diagnostic, even without a stored reason or with another failed member.</summary>
    [Theory]
    [InlineData(ProductSpecification.S101)]
    [InlineData(ProductSpecification.S57)]
    public void RejectionIncludesTheIcEncMarkerWithoutRewritingCandidateState(ProductSpecification specification) {
        var rejected = new ProductExportTrackRecord { ProductSpecification = specification, State = ProductState.Rejected };
        var other = new ProductExportTrackRecord { State = ProductState.Error, ErrorMessage = "internal/private compiler detail" };
        var s57 = specification == ProductSpecification.S57 ? rejected : other;
        var s101 = specification == ProductSpecification.S101 ? rejected : other;
        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new(), s57, s101));
        var message = EncPackageStatusResolver.GetErrorMessage(new(), s57, s101);
        Assert.Contains("RejectedByIC-ENC", message);
        Assert.DoesNotContain("internal/private", message);
        Assert.Equal(ProductState.Rejected, rejected.State);
    }

    /// <summary>Error and hold precedence cannot be hidden by simplified build/completion labels.</summary>
    [Theory]
    [InlineData(ProductState.ChangesDetected)]
    [InlineData(ProductState.Exporting)]
    [InlineData(ProductState.Validating)]
    [InlineData(ProductState.AcceptedForDistribution)]
    [InlineData(ProductState.Published)]
    [InlineData(ProductState.Cancelled)]
    public void FailureAndHoldTakePriorityOverProgressAndCompletion(ProductState state) {
        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new(), new() { State = state }, new() { State = ProductState.Error }));
        Assert.Equal(EncPackageStatus.Hold, EncPackageStatusResolver.Resolve(new(), new() { State = state }, new() { State = ProductState.ReadyForDistribution, IsManuallyFrozen = true }));
    }
}
