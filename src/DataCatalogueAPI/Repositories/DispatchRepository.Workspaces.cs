using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using S100FC;
using S100FC.S840.FeatureTypes;

namespace DataCatalague.Api.Repositories;

public partial class DispatchRepository
{
    /// <summary>Stores a projected workspace polygon in a geodatabase transaction.</summary>
    public string AddWorkspaceAOI(Polygon polygon, string pipelineId, string displayName, CancellationToken cancellationToken) {
        using var connector = this.createGeodatabase();
        using var fc = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName());
        using var definition = fc.GetDefinition();
        var spatialReference = definition.GetSpatialReference();
        if (spatialReference is null || spatialReference.IsUnknown) { throw new InvalidOperationException("Workspace coverage requires a known spatial reference."); }
        var projected = GeometryEngine.Instance.Project(polygon, spatialReference);
        if (projected.IsEmpty) { throw new InvalidDataException("Workspace geometry is empty after projection."); }
        var compatible = PackageRepository.MatchDimensions(projected, definition.HasZ(), definition.HasM());
        string? reference = null;
        connector.ApplyEdits(() => {
            cancellationToken.ThrowIfCancellationRequested();
            using var buffer = fc.CreateRowBuffer();
            buffer["ps"] = "S-840";
            buffer["code"] = nameof(WorkspaceCoverage);
            buffer["attributebindings"] = new WorkspaceCoverage { pipelineId = pipelineId, displayName = displayName }.Flatten();
            buffer[definition.GetShapeField()] = compatible;
            using var row = fc.CreateRow(buffer);
            reference = $"{fc.GetName().Split('.')[^1]}::{row.GetGlobalID():B}";
        });
        return reference!;
    }

    /// <summary>Reads the workspace polygon addressed by its stored coverage reference.</summary>
    public Polygon GetWorkspaceGeometry(string reference, CancellationToken cancellationToken) {
        using var connector = this.createGeodatabase();
        return ReadCoverage(connector, reference, cancellationToken);
    }

    /// <summary>Removes unreferenced geometry after a failed workspace event write.</summary>
    public void DeleteWorkspaceGeometry(string reference) {
        var id = ParseWorkspaceReference(reference);
        using var connector = this.createGeodatabase();
        using var fc = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName());
        using var definition = fc.GetDefinition();
        connector.ApplyEdits(() => {
            using var cursor = fc.Search(new QueryFilter { WhereClause = $"{definition.GetGlobalIDField()} = '{id.ToString("B").ToUpperInvariant()}' AND code = '{nameof(WorkspaceCoverage)}'" }, false);
            while (cursor.MoveNext()) { using var row = cursor.Current; row.Delete(); }
        });
    }

    private Polygon ReadCoverage(Geodatabase connector, string reference, CancellationToken cancellationToken) {
        var id = ParseWorkspaceReference(reference);
        using var fc = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName());
        using var definition = fc.GetDefinition();
        using var cursor = fc.Search(new QueryFilter { WhereClause = $"{definition.GetGlobalIDField()} = '{id.ToString("B").ToUpperInvariant()}' AND code = '{nameof(WorkspaceCoverage)}'" }, false);
        cancellationToken.ThrowIfCancellationRequested();
        if (!cursor.MoveNext()) { throw new InvalidOperationException($"Workspace coverage '{reference}' is missing."); }
        using var feature = (Feature)cursor.Current;
        return feature.GetShape() as Polygon ?? throw new InvalidOperationException("Workspace coverage must be a polygon.");
    }

    private static Guid ParseWorkspaceReference(string reference) {
        var parts = reference.Split("::", StringSplitOptions.None);
        if (parts.Length != 2 || !string.Equals(parts[0], "surface", StringComparison.OrdinalIgnoreCase) || !Guid.TryParse(parts[1], out var id)) {
            throw new InvalidOperationException("Invalid workspace coverage reference.");
        }
        return id;
    }
}
