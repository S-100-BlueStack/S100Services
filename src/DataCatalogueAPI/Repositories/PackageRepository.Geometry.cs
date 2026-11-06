using ArcGIS.Core.Data;
using DataCatalague.Api.Domain;
using S100FC.S840.FeatureTypes;

namespace DataCatalague.Api.Repositories;

public partial class PackageRepository
{
    /// <summary>Resolves only the references captured from one package state; call on the ArcGIS dispatcher.</summary>
    internal (string? Aoi, IReadOnlyList<string> Points, string? Curves, string? Surfaces) ReadPackageGeometry(PackageState state, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        using var connector = this.createGeodatabase();
        var aoi = Read(state.GeometryRef, nameof(PackageCoverage), "point", "pointset", "curve", "surface");
        var points = new List<string>();
        string? curves = null, surfaces = null;
        if (state.DetailedGeometry is { } details) {
            // Older events may have only PointRef; PointRefs also includes it in current events.
            IEnumerable<string> references = details.PointRefs.Count > 0 ? details.PointRefs : details.PointRef is { } point ? [point] : [];
            foreach (var reference in references.Distinct(StringComparer.OrdinalIgnoreCase)) {
                points.Add(Read(reference, nameof(PackageDetailedGeometry), "point", "pointset")!);
            }
            curves = Read(details.CurveRef, nameof(PackageDetailedGeometry), "curve");
            surfaces = Read(details.SurfaceRef, nameof(PackageDetailedGeometry), "surface");
        }
        cancellationToken.ThrowIfCancellationRequested();
        return (aoi, points, curves, surfaces);

        string? Read(string? reference, string code, params string[] allowedClasses) {
            cancellationToken.ThrowIfCancellationRequested();
            if (reference is null) { return null; }
            var parts = reference.Split("::", StringSplitOptions.None);
            if (parts.Length != 2 || !allowedClasses.Contains(parts[0], StringComparer.OrdinalIgnoreCase)
                || !Guid.TryParse(parts[1], out var globalId) || globalId == Guid.Empty
                || !this._featureClassDefinitions.TryGetValue(parts[0].ToLowerInvariant(), out var storedDefinition)) {
                throw new InvalidOperationException($"Invalid package geometry reference '{reference}'.");
            }
            using var featureClass = connector.OpenDataset<FeatureClass>(storedDefinition.GetName());
            using var definition = featureClass.GetDefinition();
            var filter = new QueryFilter {
                // Only a parsed GUID and server-owned field/code names enter this expression.
                WhereClause = $"{definition.GetGlobalIDField()} = '{globalId.ToString("B").ToUpperInvariant()}' AND code = '{code}'",
                SubFields = definition.GetShapeField(),
            };
            using var cursor = featureClass.Search(filter, false);
            cancellationToken.ThrowIfCancellationRequested();
            if (!cursor.MoveNext()) { throw new InvalidOperationException($"Referenced package geometry '{reference}' is missing."); }
            using var feature = (Feature)cursor.Current;
            var shape = feature.GetShape();
            if (shape is null || shape.IsEmpty || shape.SpatialReference is null || shape.SpatialReference.IsUnknown) {
                throw new InvalidOperationException($"Referenced package geometry '{reference}' is empty or has no known spatial reference.");
            }
            cancellationToken.ThrowIfCancellationRequested();
            return shape.ToJson();
        }
    }
}
