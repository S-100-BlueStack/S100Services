using ProductCatalogueAPI.Jobs;
using S100FC;
using S100FC.ProductCatalogue;
using S100FC.Topology;
using S100FC.YAML;

namespace TestProductCatalogueAPI;

public sealed class EncSnapshotMembershipTests
{
    [Fact]
    public void PersistedSnapshotProvesBothNonSpatialFeatureAndInformationMembership() {
        var information = Guid.Parse("ab9b3e89-d57c-47c2-a105-68ebb574db10");
        var feature = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var absent = Guid.Parse("00000000-0000-0000-0000-000000000003");
        var dataset = new S100FC.YAML.Dataset { CellName = "101DK001.000", Edition = 1 };
        dataset.AddInformation(new Information { Name = "SpatialQuality", ID = information.ToStableUInt64().ToString() });
        dataset.AddFeature(new Feature { Name = "NauticalInformation", Foid = TopologyFeatureMapping.CreateFoid(feature.ToString("B")), Prim = Primitive.NoGeometry });
        var yaml = dataset.Serialize();

        var members = EncSnapshotMembership.FindSourceMembers(yaml, [information.ToString("B"), feature.ToString("B"), absent.ToString("B")]);

        Assert.Equal(new[] { information.ToString("B"), feature.ToString("B") }, members);
    }

    [Fact]
    public void AssociationTargetWithoutAnEmittedRecordIsNotMembershipEvidence() {
        var id = Guid.Parse("ab9b3e89-d57c-47c2-a105-68ebb574db10");
        var stable = id.ToStableUInt64().ToString();
        var yaml = $"Features:\n  - Foid: '110:1:1'\n    Associations:\n      - To: '{stable}'\n        ID: '{stable}'\n        Name: SpatialQuality\n";
        Assert.Empty(EncSnapshotMembership.FindSourceMembers(yaml, [id.ToString("B")]));
    }
}
