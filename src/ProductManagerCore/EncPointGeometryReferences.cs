using System.Globalization;
using System.IO.Hashing;
using ArcGIS.Core.Geometry;
using S100FC.YAML;
using ArcGeometry = ArcGIS.Core.Geometry.Geometry;
using NtsGeometry = NetTopologySuite.Geometries.Geometry;
using NtsMultiPoint = NetTopologySuite.Geometries.MultiPoint;
using NtsPoint = NetTopologySuite.Geometries.Point;
using YamlDataset = S100FC.YAML.Dataset;
using YamlFeature = S100FC.YAML.Feature;

namespace S100FC.ProductCatalogue;

internal static class EncPointGeometryReferences
{
    internal static void Rebind(YamlDataset dataset, ArcGeometry geometry, YamlFeature feature)
    {
        // Match the ArcGIS overload's conversion in S100Framework.YAML 3.7.1901.11.
        NtsGeometry? points = geometry switch {
            MapPoint point => new NtsPoint(point.X, point.Y),
            Multipoint multipoint => new NtsMultiPoint(multipoint.Points
                .Select(point => new NtsPoint(point.X, point.Y, point.Z)).ToArray()),
            _ => null,
        };

        if (points is not null)
            Rebind(dataset, points, feature);
    }

    internal static void Rebind(YamlDataset dataset, NtsGeometry geometry, YamlFeature feature)
    {
        if (feature.Prim != Primitive.Point || (geometry is not NtsPoint && geometry is not NtsMultiPoint))
            return;

        // AddGeometry writes P{XxHash32(WKB)} but its UpdateFeatureReferences method
        // never assigns Feature.Geometry. Keep the library's emitted names and deduplication.
        var hashGeometry = geometry is NtsPoint point ? new NtsPoint(point.X, point.Y) : geometry;
        var name = "P" + XxHash32.HashToUInt32(hashGeometry.ToBinary()).ToString(CultureInfo.InvariantCulture);
        var names = geometry is NtsPoint
            ? (dataset.Points ?? []).Select(item => item.Name)
            : (dataset.Depths ?? []).Select(item => item.Name);

        if (!names.Contains(name, StringComparer.Ordinal))
            throw new InvalidOperationException($"Point geometry '{name}' was not emitted for feature '{feature.Foid}'.");

        // Bind the exact feature object, never every feature matching a temporary name.
        // Temporary GUID hashes and final coordinate hashes share the P{number} namespace.
        feature.Geometry = name;
    }

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
