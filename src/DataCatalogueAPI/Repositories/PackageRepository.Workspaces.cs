using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Repositories;

public partial class PackageRepository
{
    /// <summary>Finds bound packages whose current rectangular AOIs intersect the workspace, using the spatial index.</summary>
    internal IReadOnlyList<PackageState> FindWorkspacePackages(string pipelineId, Polygon workspace, CancellationToken cancellationToken) {
        var matches = this.FindIntersectingAois(workspace.ToJson(), cancellationToken);
        var candidates = new List<PackageState>();
        foreach (var match in matches) {
            cancellationToken.ThrowIfCancellationRequested();
            if (this._assignments.Contains(match.Key, pipelineId)
                && this._packages.TryGetValue(match.Key, out var package) && package.GeometryRef is { } reference && match.Value.Contains(reference)) {
                candidates.Add(package);
            }
        }
        return candidates.OrderBy(package => package.Id!.Value, StringComparer.Ordinal).ToArray();
    }

    /// <summary>Tests only the package's current AOI reference; no detail geometry is loaded.</summary>
    internal bool AoiIntersectsWorkspace(string aoiReference, Polygon workspace, CancellationToken cancellationToken) =>
        this.AoiIntersectsWorkspaces(aoiReference, [workspace], cancellationToken)[0];

    /// <summary>Tests multiple workspaces with one geodatabase and feature class read scope.</summary>
    internal IReadOnlyList<bool> AoiIntersectsWorkspaces(string aoiReference, IReadOnlyList<Polygon> workspaces, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(workspaces);
        cancellationToken.ThrowIfCancellationRequested();
        if (workspaces.Count == 0) { return []; }

        var parts = aoiReference.Split("::", StringSplitOptions.None);
        if (parts.Length != 2 || !string.Equals(parts[0], "surface", StringComparison.OrdinalIgnoreCase) || !Guid.TryParse(parts[1], out var id)) {
            throw new InvalidOperationException("Invalid package AOI reference.");
        }
        using var connector = this.createGeodatabase();
        using var fc = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName());
        using var definition = fc.GetDefinition();
        var spatialReference = definition.GetSpatialReference();
        if (spatialReference is null || spatialReference.IsUnknown) { throw new InvalidOperationException("Package AOI coverage requires a known spatial reference."); }
        var globalIdField = definition.GetGlobalIDField();
        var whereClause = $"{globalIdField} = '{id.ToString("B").ToUpperInvariant()}' AND code = '{nameof(S100FC.S840.FeatureTypes.PackageCoverage)}'";
        var intersections = new bool[workspaces.Count];
        for (var index = 0; index < workspaces.Count; index++) {
            cancellationToken.ThrowIfCancellationRequested();
            var workspace = workspaces[index];
            var geometry = workspace.SpatialReference.IsEqual(spatialReference) ? workspace : GeometryEngine.Instance.Project(workspace, spatialReference);
            var filter = new SpatialQueryFilter {
                FilterGeometry = geometry,
                SpatialRelationship = SpatialRelationship.Intersects,
                // Retain the current AOI reference check so replaced historical rows cannot match.
                WhereClause = whereClause,
                SubFields = globalIdField,
            };
            using var cursor = fc.Search(filter, false);
            intersections[index] = cursor.MoveNext();
            if (intersections[index]) { using var row = cursor.Current; }
            cancellationToken.ThrowIfCancellationRequested();
        }
        return intersections;
    }
}
