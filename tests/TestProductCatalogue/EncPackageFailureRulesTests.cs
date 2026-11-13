using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogue;

/// <summary>Checks failed-pair retirement and edition allocation without any external stores or clocks.</summary>
public sealed class EncPackageFailureRulesTests
{
    /// <summary>A failed member permits retiring its in-transit, accepted, rejected or ready sibling.</summary>
    [Theory]
    [InlineData(ProductState.InTransit, ProductState.Rejected)]
    [InlineData(ProductState.AcceptedForDistribution, ProductState.Rejected)]
    [InlineData(ProductState.Rejected, ProductState.AcceptedForDistribution)]
    [InlineData(ProductState.Error, ProductState.ReadyForDistribution)]
    [InlineData(ProductState.Rejected, ProductState.Error)]
    public void FailedPairsCanBeAcknowledged(ProductState s101, ProductState s57) =>
        Assert.True(EncPackageFailureRules.CanAcknowledge(Package(), Track(ProductSpecification.S101, s101), Track(ProductSpecification.S57, s57)));

    /// <summary>Normal waiting and publication are protected, as are active encoders and validators.</summary>
    [Theory]
    [InlineData(ProductState.InTransit, ProductState.InTransit)]
    [InlineData(ProductState.AcceptedForDistribution, ProductState.InTransit)]
    [InlineData(ProductState.AcceptedForDistribution, ProductState.AcceptedForDistribution)]
    [InlineData(ProductState.ReadyForDistribution, ProductState.ReadyForDistribution)]
    [InlineData(ProductState.Exporting, ProductState.Error)]
    [InlineData(ProductState.Error, ProductState.Validating)]
    public void HealthyOrActivePairsCannotBeAcknowledged(ProductState s101, ProductState s57) =>
        Assert.False(EncPackageFailureRules.CanAcknowledge(Package(), Track(ProductSpecification.S101, s101), Track(ProductSpecification.S57, s57)));

    /// <summary>A preflight/inbox failure can expose acknowledgement without falsifying either export's current state.</summary>
    [Fact]
    public void PackageSendErrorPermitsRetirementButNeverInterruptsSuccessfulPublication() {
        var package = Package();
        package.ErrorMessage = "The package send failed.";
        var s101 = Track(ProductSpecification.S101, ProductState.ReadyForDistribution);
        var s57 = Track(ProductSpecification.S57, ProductState.ReadyForDistribution);
        Assert.True(EncPackageFailureRules.CanAcknowledge(package, s101, s57));
        s101.State = s57.State = ProductState.AcceptedForDistribution;
        Assert.False(EncPackageFailureRules.CanAcknowledge(package, s101, s57));
    }

    /// <summary>Independent manual holds, mismatched identities and missing tracks never authorize a reset.</summary>
    [Fact]
    public void ExactPairAndManualHoldGuardsRemainRequired() {
        var s101 = Track(ProductSpecification.S101, ProductState.Error);
        var s57 = Track(ProductSpecification.S57, ProductState.InTransit);
        s57.IsManuallyFrozen = true;
        Assert.False(EncPackageFailureRules.CanAcknowledge(Package(), s101, s57));
        s57.IsManuallyFrozen = false;
        s57.DatasetName = "OTHER";
        Assert.False(EncPackageFailureRules.CanAcknowledge(Package(), s101, s57));
        Assert.False(EncPackageFailureRules.CanAcknowledge(Package(), s101, null));
    }

    /// <summary>The next edition exceeds an abandoned candidate without promoting it to a published S-128 version.</summary>
    [Theory]
    [InlineData(0, 1, 2)]
    [InlineData(1, 2, 3)]
    [InlineData(5, 2, 6)]
    public void AcknowledgedEditionsAreNeverReused(int published, int acknowledged, int expected) {
        var track = new ProductExportTrackRecord { PublishedEdition = published, AcknowledgedEdition = acknowledged };
        Assert.Equal(expected, track.NextNewEdition);
        Assert.Equal(published, track.PublishedEdition);
    }

    /// <summary>Sources with no retired failures retain the existing edition allocation rule.</summary>
    [Fact]
    public void UnacknowledgedSourcesRetainTheirExistingEditionRule() => Assert.Equal(1, new ProductExportTrackRecord().NextNewEdition);

    /// <summary>Builds an exact shared snapshot identity.</summary>
    private static EncPackage Package() => new() { Id = Guid.NewGuid(), SourceDatasetName = "101DK0041335E", S57DatasetName = "DK41335E" };

    /// <summary>Creates one member with the canonical package identity.</summary>
    private static ProductExportTrackRecord Track(ProductSpecification specification, ProductState state) => new() {
        DatasetName = specification == ProductSpecification.S101 ? "101DK0041335E" : "DK41335E",
        ProductSpecification = specification, State = state, CandidateEdition = 2, CandidateUpdate = 0
    };
}
