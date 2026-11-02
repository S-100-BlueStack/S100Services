using ArcGIS.Core.Geometry;
using S100FC.YAML;
using ArcGeometry = ArcGIS.Core.Geometry.Geometry;
using NtsGeometry = NetTopologySuite.Geometries.Geometry;
using NtsMultiPoint = NetTopologySuite.Geometries.MultiPoint;
using NtsPoint = NetTopologySuite.Geometries.Point;
using YamlDataset = S100FC.YAML.Dataset;
using YamlFeature = S100FC.YAML.Feature;

namespace S100FC.ProductCatalogue;

/// <summary>Binds point features to geometry definitions actually emitted by the YAML library.</summary>
internal static class EncPointGeometryReferences
{
    /// <summary>Matches the ArcGIS geometry conversion used by the YAML emitter before resolving its actual output name.</summary>
    /// <param name="dataset">The dataset after AddGeometry has emitted or reused the geometry.</param>
    /// <param name="geometry">The exact source geometry supplied to AddGeometry.</param>
    /// <param name="feature">The individual feature whose reference may be rebound.</param>
    internal static void Rebind(YamlDataset dataset, ArcGeometry geometry, YamlFeature feature)
    {
        NtsGeometry? points = geometry switch {
            MapPoint point => new NtsPoint(point.X, point.Y),
            Multipoint multipoint => new NtsMultiPoint(multipoint.Points
                .Select(point => new NtsPoint(point.X, point.Y, point.Z)).ToArray()),
            _ => null,
        };

        if (points is not null)
            Rebind(dataset, points, feature);
    }

    /// <summary>Resolves an emitted point or sounding definition by its coordinates and depths, independent of library naming conventions.</summary>
    /// <param name="dataset">The dataset containing the emitted geometry definitions.</param>
    /// <param name="geometry">The source point or ordered sounding geometry.</param>
    /// <param name="feature">Only this feature's Geometry property is updated.</param>
    /// <exception cref="InvalidOperationException">No matching definition exists, or multiple names cannot be resolved safely.</exception>
    internal static void Rebind(YamlDataset dataset, NtsGeometry geometry, YamlFeature feature)
    {
        if (feature.Prim != Primitive.Point || (geometry is not NtsPoint && geometry is not NtsMultiPoint))
            return;

        // The ArcGIS overload in YAML .12 retains the supplied name, while the NTS
        // overload uses a hash. Resolve the output instead of reproducing either policy.
        var names = geometry is NtsPoint point
            ? (dataset.Points ?? []).Where(item => item.Coordinate is { } coordinate &&
                coordinate.X.Equals(point.X) && coordinate.Y.Equals(point.Y)).Select(item => item.Name)
            : (dataset.Depths ?? []).Where(item => MatchesSoundings(item, (NtsMultiPoint)geometry)).Select(item => item.Name);
        var candidates = names.Where(name => !string.IsNullOrWhiteSpace(name)).Cast<string>()
            .Distinct(StringComparer.Ordinal).ToArray();
        var name = candidates.Contains(feature.Geometry, StringComparer.Ordinal) ? feature.Geometry
            : candidates.Length == 1 ? candidates[0] : null;
        if (name is null)
            throw new InvalidOperationException(candidates.Length == 0
                ? $"No emitted point geometry matches the coordinates and depths of feature '{feature.Foid}'."
                : $"Multiple emitted point geometry names match feature '{feature.Foid}', and its current reference does not identify one.");

        // Never rebind all features sharing a temporary reference: it can also be
        // another feature's final geometry name.
        feature.Geometry = name;
    }

    /// <summary>Compares ordered XY and rounded Z values using the YAML emitter's sounding representation.</summary>
    /// <param name="emitted">The persisted sounding geometry definition.</param>
    /// <param name="source">The ordered source points, including their depths.</param>
    /// <returns>Whether every coordinate and emitted depth matches without reordering or loss.</returns>
    private static bool MatchesSoundings(PointSet emitted, NtsMultiPoint source) {
        if (emitted.Points.Length != source.NumGeometries || emitted.Depths.Length != source.NumGeometries)
            return false;
        for (var index = 0; index < source.NumGeometries; index++) {
            var point = (NtsPoint)source.GetGeometryN(index);
            if (!emitted.Points[index].X.Equals(point.X) || !emitted.Points[index].Y.Equals(point.Y) ||
                !emitted.Depths[index].Equals(Math.Round(point.Coordinate.Z, 7)))
                return false;
        }
        return true;
    }

    /// <summary>Rejects dangling point references before the shared YAML snapshot reaches either compiler.</summary>
    /// <param name="dataset">The completed geometry and topology dataset.</param>
    /// <exception cref="InvalidOperationException">A point feature references no emitted point or sounding definition.</exception>
    internal static void RequireResolvedPointReferences(YamlDataset dataset)
    {
        var names = (dataset.Points ?? []).Select(item => item.Name)
            .Concat((dataset.Depths ?? []).Select(item => item.Name))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .ToHashSet(StringComparer.Ordinal);

        foreach (var feature in dataset.Features ?? []) {
            if (feature.Prim == Primitive.Point && !names.Contains(feature.Geometry))
                throw new InvalidOperationException($"Feature '{feature.Foid}' references missing point geometry '{feature.Geometry}'.");
        }
    }
}
