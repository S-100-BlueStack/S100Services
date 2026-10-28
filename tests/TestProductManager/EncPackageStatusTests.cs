using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Models;

namespace TestProductCatalogueAPI;

public sealed class EncPackageStatusTests
{
    [Fact]
    public void EitherFailedExportMakesThePackageErrorUntilDiscarded() {
        var package = Package();
        var s57 = Track(ProductSpecification.S57, ProductState.Error);
        var s101 = Track(ProductSpecification.S101, ProductState.ReadyForDistribution);

        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(package, s57, s101));

        package.S57Discarded = true;
        Assert.Equal(EncPackageStatus.Ready, EncPackageStatusResolver.Resolve(package, s57, s101));
    }

    [Fact]
    public void OneInTransitCandidateLocksTheWholePackage() {
        var package = Package();
        var s57 = Track(ProductSpecification.S57, ProductState.InTransit);
        var s101 = Track(ProductSpecification.S101, ProductState.ReadyForDistribution);

        Assert.Equal(EncPackageStatus.InTransit, EncPackageStatusResolver.Resolve(package, s57, s101));
    }

    [Fact]
    public void LegacyFrozenTrackStillHoldsThePackage() {
        var package = Package();
        var s57 = Track(ProductSpecification.S57, ProductState.ReadyForDistribution);
        var s101 = Track(ProductSpecification.S101, ProductState.Frozen);

        Assert.Equal(EncPackageStatus.Held, EncPackageStatusResolver.Resolve(package, s57, s101));
    }

    [Fact]
    public void S101ExportFailureProvidesPackageMessageEvenWithoutAPackageRowError() {
        var package = Package();
        var s57 = Track(ProductSpecification.S57, ProductState.ReadyForDistribution);
        var s101 = Track(ProductSpecification.S101, ProductState.Error);
        s101.ErrorMessage = "SevenCs validation found 3 critical findings.";

        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(package, s57, s101));
        Assert.Equal(s101.ErrorMessage, EncPackageStatusResolver.GetErrorMessage(package, s57, s101));
    }

    [Fact]
    public void OtherFailedCandidateRetainsItsMessageAfterOneDiscard() {
        var package = Package();
        package.S57Discarded = true;
        var s57 = Track(ProductSpecification.S57, ProductState.Error);
        s57.ErrorMessage = "Old failure";
        var s101 = Track(ProductSpecification.S101, ProductState.Rejected);
        s101.ErrorMessage = "IC-ENC rejected the S-101 candidate.";

        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(package, s57, s101));
        Assert.Equal(s101.ErrorMessage, EncPackageStatusResolver.GetErrorMessage(package, s57, s101));
    }

    [Fact]
    public void FailedCandidateWithoutDiagnosticStillHasAVisiblePackageMessage() {
        var package = Package();
        var s101 = Track(ProductSpecification.S101, ProductState.Error);

        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(package, null, s101));
        Assert.Contains("S-101", EncPackageStatusResolver.GetErrorMessage(package, null, s101));
    }

    private static EncPackage Package() => new() { SourceDatasetName = "101DK001", S57DatasetName = "DK3BIDQE" };

    private static ProductExportTrackRecord Track(ProductSpecification specification, ProductState state) => new() { ProductSpecification = specification, State = state };
}
