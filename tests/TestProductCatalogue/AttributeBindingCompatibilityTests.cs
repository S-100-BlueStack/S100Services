using S100BlueStack.Settings;
using S100FC;
using S100FC.S100;
using S100FC.S101.FeatureTypes;
using S100FC.S101.InformationTypes;
using S100FC.S128.FeatureTypes;
using Xunit;

namespace TestProductCatalogueAPI;

/// <summary>Verifies that the catalogue readers still accept existing geodatabase attribute bindings.</summary>
public sealed class AttributeBindingCompatibilityTests
{
    /// <summary>Checks that existing S-128 product identity and version attributes survive an edit and write.</summary>
    [Fact]
    public void ElectronicProductPreservesStoredIdentityWhenUpdated() {
        const string storedBindings = """
            {
              "datasetName": "101DK0000001E",
              "productSpecification.name": "S-101",
              "editionNumber": 3,
              "updateNumber": 2
            }
            """;

        var product = AttributeFlattenExtensions.UnflattenFeatureType<ElectronicProduct>(storedBindings);
        Assert.Equal(2, product.updateNumber);
        product.updateNumber = 3;

        var updated = AttributeFlattenExtensions.UnflattenFeatureType<ElectronicProduct>(product.Flatten());

        Assert.Equal("101DK0000001E", updated.datasetName);
        Assert.Equal("S-101", updated.productSpecification?.name);
        Assert.Equal(3, updated.editionNumber);
        Assert.Equal(3, updated.updateNumber);
    }

    /// <summary>Checks that the runtime-selected S-101 feature type receives its generated attributes.</summary>
    [Fact]
    public void RuntimeFeatureTypeRestoresDataCoverageAttributes() {
        const string storedBindings = """{"optimumDisplayScale":90000}""";

        var feature = AttributeFlattenExtensions.UnflattenFeatureType(storedBindings, typeof(DataCoverage));

        Assert.Equal(90_000, Assert.IsType<DataCoverage>(feature).optimumDisplayScale);
    }

    /// <summary>Checks that runtime-selected S-101 information retains repeated text attributes.</summary>
    [Fact]
    public void RuntimeInformationTypeRestoresRepeatedInformation() {
        const string storedBindings = """
            {"information[0].text":"First notice","information[1].text":"Second notice"}
            """;

        var information = AttributeFlattenExtensions.UnflattenInformationType(storedBindings, typeof(NauticalInformation));

        Assert.Collection(Assert.IsType<NauticalInformation>(information).information,
            first => Assert.Equal("First notice", first?.text),
            second => Assert.Equal("Second notice", second?.text));
    }

    /// <summary>Checks that existing attachment metadata retains its filename, format, and date.</summary>
    [Fact]
    public void RawReaderRestoresSupportFileMetadata() {
        const string storedMetadata = """
            {"FileName":"notice.txt","s100_SupportFileFormat":0,"version":"1","date":"2026-11-23"}
            """;

        var file = AttributeFlattenExtensions.UnflattenRaw<SupportFile>(storedMetadata);

        Assert.Equal("notice.txt", file.FileName);
        Assert.Equal(S100_SupportFileFormat.TXT, file.s100_SupportFileFormat);
        Assert.Equal("1", file.version);
        Assert.Equal(new DateOnly(2026, 11, 23), file.date);
    }
}
