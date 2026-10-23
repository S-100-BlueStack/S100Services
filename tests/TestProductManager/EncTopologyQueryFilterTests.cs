using ArcGIS.Core.Data;
using NetTopologySuite.IO;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class EncTopologyQueryFilterTests
{
    private const string Coverage = "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))";

    [Fact]
    public void ContainedPointSurvivesTheRelationThatPreviouslyLeakedFromSurfaceQueries()
    {
        var reader = new WKTReader();
        var coverage = reader.Read(Coverage);
        var point = reader.Read("POINT (2 2)");
        var filter = AutomaticRelation();

        // The supplied package ends its surface loop with this matrix and reuses it for point.
        Assert.False(coverage.Relate(point, "T*T***T**"));

        EncTopologyQueryFilters.PrepareForVerifiedSnapshot([filter]);

        Assert.True(coverage.Relate(point, filter.SpatialRelationshipDescription));
    }

    [Theory]
    [InlineData("POINT (2 2)", true)]
    [InlineData("POINT (12 2)", false)]
    [InlineData("POINT (0 2)", false)]
    [InlineData("MULTIPOINT ((2 2), (3 3))", true)]
    [InlineData("MULTIPOINT ((2 2), (12 2))", true)]
    [InlineData("MULTIPOINT ((12 2), (13 3))", false)]
    [InlineData("LINESTRING (2 2, 3 3)", true)]
    [InlineData("LINESTRING (-2 5, 12 5)", true)]
    [InlineData("LINESTRING (12 2, 13 3)", false)]
    [InlineData("LINESTRING (0 2, 0 8)", false)]
    [InlineData("POLYGON ((2 2, 3 2, 3 3, 2 3, 2 2))", true)]
    [InlineData("POLYGON ((8 2, 12 2, 12 3, 8 3, 8 2))", true)]
    [InlineData("POLYGON ((10 2, 12 2, 12 3, 10 3, 10 2))", false)]
    public void SelectionKeepsInteriorFeaturesAndExcludesOutsideOrBoundaryOnlyFeatures(string featureWkt, bool expected)
    {
        var reader = new WKTReader();
        var filter = AutomaticRelation();

        EncTopologyQueryFilters.PrepareForVerifiedSnapshot([filter]);

        Assert.Equal(expected, reader.Read(Coverage).Relate(reader.Read(featureWkt), filter.SpatialRelationshipDescription));
    }

    [Theory]
    [InlineData("POINT (2 2)", "point")]
    [InlineData("POINT (0 2)", "point")]
    [InlineData("POINT (12 2)", "point")]
    [InlineData("MULTIPOINT ((2 2), (12 2))", "pointset")]
    [InlineData("MULTIPOINT ((0 2), (0 8))", "pointset")]
    [InlineData("LINESTRING (2 2, 3 3)", "curve")]
    [InlineData("LINESTRING (-2 5, 12 5)", "curve")]
    [InlineData("LINESTRING (0 2, 0 8)", "curve")]
    [InlineData("POLYGON ((8 2, 12 2, 12 3, 8 3, 8 2))", "surface")]
    [InlineData("POLYGON ((10 2, 12 2, 12 3, 10 3, 10 2))", "surface")]
    public void ExplicitRelationMatchesThePackagesIntendedPerClassRelationUnion(string featureWkt, string table)
    {
        var reader = new WKTReader();
        var coverage = reader.Read(Coverage);
        var feature = reader.Read(featureWkt);
        // These are the per-class patterns in the supplied Catalogues.Extensions 3.7.1901.6.
        string[] intendedPatterns = table switch
        {
            "surface" => ["T********", "T*****FF*", "T*T***T**"],
            "point" => ["T*****FF*"],
            _ => ["T*****FF*", "T*T***T**"]
        };
        var filter = AutomaticRelation();

        EncTopologyQueryFilters.PrepareForVerifiedSnapshot([filter]);

        Assert.Equal(intendedPatterns.Any(pattern => coverage.Relate(feature, pattern)),
            coverage.Relate(feature, filter.SpatialRelationshipDescription));
    }

    [Fact]
    public void CoverageScaleAndExplicitEqualityFilterRemainIntact()
    {
        var automatic = AutomaticRelation();
        automatic.WhereClause = "upper(ps) = 'S-101' AND nominalscale = 4000";
        automatic.SubFields = "OBJECTID,GLOBALID,CODE,SHAPE";
        var equality = new SpatialQueryFilter
        {
            WhereClause = "upper(ps) = 'S-101' AND (nominalscale = 4000 OR nominalscale = 8000)",
            SpatialRelationship = SpatialRelationship.Relation,
            SpatialRelationshipDescription = "T*F**FFF*"
        };

        EncTopologyQueryFilters.PrepareForVerifiedSnapshot([automatic, equality]);
        EncTopologyQueryFilters.PrepareForVerifiedSnapshot([automatic, equality]);

        Assert.Equal("upper(ps) = 'S-101' AND nominalscale = 4000", automatic.WhereClause);
        Assert.Equal("OBJECTID,GLOBALID,CODE,SHAPE", automatic.SubFields);
        Assert.Equal(SpatialRelationship.Relation, automatic.SpatialRelationship);
        Assert.Equal("T*F**FFF*", equality.SpatialRelationshipDescription);
        Assert.Equal("upper(ps) = 'S-101' AND (nominalscale = 4000 OR nominalscale = 8000)", equality.WhereClause);
    }

    [Fact]
    public void NonRelationFilterKeepsItsRequestedSpatialOperation()
    {
        var filter = new SpatialQueryFilter { SpatialRelationship = SpatialRelationship.Intersects };

        EncTopologyQueryFilters.PrepareForVerifiedSnapshot([filter]);

        Assert.Equal(SpatialRelationship.Intersects, filter.SpatialRelationship);
        Assert.True(string.IsNullOrEmpty(filter.SpatialRelationshipDescription));
    }

    private static SpatialQueryFilter AutomaticRelation() => new()
    {
        SpatialRelationship = SpatialRelationship.Relation,
        SpatialRelationshipDescription = string.Empty
    };
}
