using S100FC.ProductCatalogue;
using S100FC.S128.ComplexAttributes;
using S100FC.S128.FeatureTypes;

namespace TestProductCatalogueAPI;

public sealed class ElectronicProductMappingIndexTests
{
    private const string ProductMappingToS101 = """
        [{"association":{"code":"ProductMapping","attributes":[{"code":"categoryOfProductMapping","value":1}]},"roleType":"association","role":"theReference","featureType":"ElectronicProduct","featureId":"F101"}]
        """;

    [Fact]
    public void ResolvesOneWayProductMappingInBothDirections() {
        var s57 = Product("DK3BIDQE", "S-57");
        var s101 = Product("101DK003BIDQE", "S-101");
        var index = ElectronicProductMappingIndex.Create([
            new ElectronicProductCatalogueEntry("F057", s57, ProductMappingToS101),
            new ElectronicProductCatalogueEntry("F101", s101, "[]")
        ]);

        Assert.Same(s101, index.Resolve("DK3BIDQE", "S101"));
        Assert.Same(s57, Assert.Single(index.GetMapped("101DK003BIDQE", "S57")));
    }

    [Fact]
    public void DoesNotTreatEqualDatasetNamesAsAProductMapping() {
        var index = ElectronicProductMappingIndex.Create([
            new ElectronicProductCatalogueEntry("F057", Product("SHARED", "S-57"), "[]"),
            new ElectronicProductCatalogueEntry("F101", Product("SHARED", "S-101"), "[]")
        ]);

        Assert.Throws<ProductMappingIntegrityException>(() => index.ResolveByDatasetName("SHARED"));
        Assert.Empty(index.GetMapped("SHARED", "S57"));
        Assert.Empty(index.GetMapped("SHARED", "S101"));
    }

    [Fact]
    public void IgnoresBindingsThatAreNotProductMappings() {
        const string otherBinding = """
            [{"association":{"code":"OtherAssociation"},"featureType":"ElectronicProduct","featureId":"F101"}]
            """;
        var index = ElectronicProductMappingIndex.Create([
            new ElectronicProductCatalogueEntry("F057", Product("DK3BIDQE", "S-57"), otherBinding),
            new ElectronicProductCatalogueEntry("F101", Product("101DK003BIDQE", "S-101"), "[]")
        ]);

        Assert.Empty(index.GetMapped("DK3BIDQE", "S101"));
    }

    private static ElectronicProduct Product(string name, string specification) => new() {
        datasetName = name,
        productSpecification = new productSpecification { name = specification }
    };
}
