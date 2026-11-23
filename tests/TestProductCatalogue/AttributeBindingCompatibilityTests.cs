using S100BlueStack.Settings;
using S100FC;
using S100FC.ProductCatalogue;
using S100FC.S100;
using S100FC.S101.FeatureTypes;
using S100FC.S101.InformationTypes;
using S100FC.S128.FeatureAssociation;
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

    /// <summary>Verifies the information association properties the S-101 YAML exporter reads.</summary>
    [Fact]
    public void FlattenedS101InformationBindingRetainsTheAssociationCodeAndTarget() {
        var target = new ArchiveBindingTarget(ArchiveBindingKind.Information, Guid.Parse("AB9B3E89-D57C-47C2-A105-68EBB574DB10"));
        var binding = Assert.Single(AttributeFlattenExtensions.UnflattenInformationBindings(ArchiveBindingIndexTests.Json(target)));

        Assert.True(binding.Validate());
        Assert.Equal("QualityOfBathymetricDataComposition", binding.association?.S100FC_code);
        Assert.Equal("theQualityInformation", binding.role);
        Assert.Equal(target.Id, Guid.Parse(binding.informationId));
    }

    /// <summary>Verifies the feature association properties the S-101 YAML exporter reads.</summary>
    [Fact]
    public void FlattenedS101FeatureBindingRetainsTheAssociationCodeAndTarget() {
        var target = new ArchiveBindingTarget(ArchiveBindingKind.Feature, Guid.Parse("AB9B3E89-D57C-47C2-A105-68EBB574DB10"));
        var binding = Assert.Single(AttributeFlattenExtensions.UnflattenFeatureBindings(ArchiveBindingIndexTests.Json(target)));

        Assert.True(binding.Validate());
        Assert.Equal("FairwayAggregation", binding.association?.S100FC_code);
        Assert.Equal("theComponent", binding.role);
        Assert.Equal(target.Id, Guid.Parse(binding.featureId));
    }

    /// <summary>Checks that a ProductMapping link resolves in both directions when stored alongside a different association.</summary>
    [Fact]
    public void FlattenedProductMappingResolvesBothDirections() {
        const string s101Id = "{43D0AC2E-17CD-4957-B82B-F900154E1EC1}";
        const string s57Id = "{E80F24FB-0903-411F-82E8-31A86A25AC33}";
        const string correlatedId = "{854FA3F4-48EB-4C6A-B1F1-1A7B289F6428}";
        var s101 = CreateProduct("101DK005TELKS", "S-101");
        var s57 = CreateProduct("DK5TELKS", "S-57");
        var correlated = CreateProduct("101DK005TEST1", "S-101");
        featureBinding[] bindings = [
            new featureBinding<ProductMapping> {
                association = new ProductMapping { categoryOfProductMapping = 1 },
                roleType = "association",
                role = "theReference",
                featureType = nameof(ElectronicProduct),
                featureId = s101Id,
                Primitive = Primitives.surface
            },
            new featureBinding<Correlated> {
                roleType = "association",
                role = "thePanel",
                featureType = nameof(ElectronicProduct),
                featureId = correlatedId,
                Primitive = Primitives.surface
            }
        ];

        var index = ElectronicProductMappingIndex.Create([
            new(s57Id, s57, bindings.Flatten()),
            new(s101Id, s101, "{}"),
            new(correlatedId, correlated, null)
        ]);

        Assert.Same(s57, Assert.Single(index.GetMapped(s101.datasetName!, "S57")));
        Assert.Same(s101, Assert.Single(index.GetMapped(s57.datasetName!, "S101")));
        Assert.Empty(index.GetMapped(correlated.datasetName!, "S57"));
    }

    /// <summary>Checks that unrelated associations and a missing target cannot produce a false ENC pair.</summary>
    [Fact]
    public void FlattenedBindingsRequireAProductMappingToAnExistingElectronicProduct() {
        var s101 = CreateProduct("101DK005TELKS", "S-101");
        var s57 = CreateProduct("DK5TELKS", "S-57");
        const string bindings = """
            {
              "featureBinding[0].association.code": "Correlated",
              "featureBinding[0].featureType": "ElectronicProduct",
              "featureBinding[0].featureId": "F101",
              "featureBinding[1].association.code": "ProductMapping",
              "featureBinding[1].featureType": "ElectronicProduct",
              "featureBinding[1].featureId": "MISSING",
              "featureBinding[2].association.code": "ProductMapping",
              "featureBinding[2].featureType": "PaperChart",
              "featureBinding[2].featureId": "F101"
            }
            """;

        var index = ElectronicProductMappingIndex.Create([new("F057", s57, bindings), new("F101", s101, null)]);

        Assert.Empty(index.GetMapped(s101.datasetName!, "S57"));
        Assert.Empty(index.GetMapped(s57.datasetName!, "S101"));
    }

    /// <summary>Creates an S-128 product with the identity fields required by the mapping index.</summary>
    /// <param name="datasetName">The S-128 dataset name.</param>
    /// <param name="specification">The name of the product specification.</param>
    /// <returns>A product suitable for indexing without a geodatabase.</returns>
    private static ElectronicProduct CreateProduct(string datasetName, string specification) => new() {
        datasetName = datasetName,
        productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = specification }
    };

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
