using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class EncMetadataSurfaceYamlCleanupTests
{
    private const string Source = """
CellName: TEST.000
Curves:
  - Name: C1
    Vertices: 0,0,1,0,1,1,0,0
  - Name: C2
    Vertices: 0,0,2,0,2,2,0,0
CompositeCurves:
  - Name: C3
    Components: C1,C2
Surfaces:
  - Name: S1
    Exterior: C1
  - Name: S2
    Exterior: C2
    Interior:
      - Hole: RC3
  - Name: S3
    Exterior: C3
Features:
  - Name: DataCoverage
    Foid: 110:1:1
    Geometry: S1
  - Name: SoundingDatum
    Foid: 110:3:1
    Geometry: S3
""";

    [Fact]
    public void RemovesOnlyExplicitUnreferencedSurfaceWhilePreservingOtherBytes()
    {
        var result = EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(Source, ["S2"]);

        Assert.DoesNotContain("  - Name: S2\n", result);
        Assert.Contains("  - Name: S1\n    Exterior: C1\n", result);
        Assert.Contains("  - Name: S3\n    Exterior: C3\n", result);
        Assert.Contains("  - Name: C2\n    Vertices:", result);
        Assert.Contains("  - Name: C3\n    Components: C1,C2\n", result);
        Assert.Equal(Source.Replace("  - Name: S2\n    Exterior: C2\n    Interior:\n      - Hole: RC3\n", "", StringComparison.Ordinal), result);
    }

    [Fact]
    public void SupportsCrLfWithoutReformattingTheSnapshot()
    {
        var original = Source.Replace("\n", "\r\n", StringComparison.Ordinal);
        var result = EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(original, ["S2"]);

        Assert.Equal(original.Replace("  - Name: S2\r\n    Exterior: C2\r\n    Interior:\r\n      - Hole: RC3\r\n", "", StringComparison.Ordinal), result);
    }

    [Fact]
    public void MultipleSuppressedSurfacesAreRemovedWithoutTouchingCurves()
    {
        var document = Source.Replace("Geometry: S3", "Geometry: S1", StringComparison.Ordinal);
        var result = EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(document, ["S2", "S3"]);

        Assert.Contains("  - Name: S1", result);
        Assert.DoesNotContain("  - Name: S2", result);
        Assert.DoesNotContain("  - Name: S3", result);
        Assert.Contains("  - Name: C3\n    Components: C1,C2", result);
    }

    [Fact]
    public void NoSuppressedSurfacesLeavesTheSnapshotExactlyUnchanged()
    {
        Assert.Same(Source, EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(Source, []));
    }

    [Fact]
    public void RefusesToDeleteSurfaceReferencedByAnySurvivingFeature()
    {
        var document = Source.Replace("Geometry: S3", "Geometry: S2", StringComparison.Ordinal);

        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(document, ["S2"]));
    }

    [Fact]
    public void RefusesToDeleteSurfaceReferencedFromAnotherTopologyElement()
    {
        var document = Source.Replace("Exterior: C3\n", "Exterior: S2\n", StringComparison.Ordinal);

        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(document, ["S2"]));
    }

    [Fact]
    public void RefusesToDeleteSurfaceWithAnyOtherYamlReference()
    {
        var document = Source.Replace("CellName: TEST.000", "CellName: TEST.000\nComment: S2", StringComparison.Ordinal);

        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(document, ["S2"]));
    }

    [Fact]
    public void RefusesUnknownAndInvalidSurfaceIdentities()
    {
        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(Source, ["Smissing"]));
        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(Source, ["C2"]));
        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(Source, ["S2\nFeatures:"]));
    }

    [Fact]
    public void RefusesAmbiguousSurfaceSection()
    {
        var document = Source.Replace("Features:\n", "Surfaces:\nFeatures:\n", StringComparison.Ordinal);

        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(document, ["S2"]));
    }

    [Fact]
    public void RefusesDuplicateTopologyIdentity()
    {
        var document = Source.Replace("  - Name: S3", "  - Name: S1", StringComparison.Ordinal);

        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(document, ["S2"]));
    }

    [Fact]
    public void RefusesDeletingSurfaceWithInvalidStructure()
    {
        var document = Source.Replace("    Exterior: C2\n", "    Geometry: C2\n", StringComparison.Ordinal);

        Assert.Throws<InvalidDataException>(() => EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(document, ["S2"]));
    }
}
