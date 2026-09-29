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

    private static EncPackage Package() => new() { SourceDatasetName = "101DK001", S57DatasetName = "DK3BIDQE" };

    private static ProductExportTrackRecord Track(ProductSpecification specification, ProductState state) => new() { ProductSpecification = specification, State = state };
}
