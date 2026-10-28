using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1;

/// <summary>Identifies a stored feature; coordinates are held in the geodatabase.</summary>
/// <param name="FeatureClass">The feature class containing the feature.</param>
/// <param name="GlobalId">The feature's GlobalID, independent of its row number.</param>
public sealed record GeometryReferenceResponse(string FeatureClass, Guid GlobalId)
{
    /// <summary>Converts the existing event reference to an explicit API representation.</summary>
    /// <param name="reference">The feature-class and GlobalID reference stored in an event.</param>
    /// <returns>The structured reference, or null when no geometry exists.</returns>
    /// <exception cref="InvalidOperationException">The stored reference is malformed.</exception>
    internal static GeometryReferenceResponse? FromStoredReference(string? reference) {
        if (reference is null) { return null; }
        var separator = reference.IndexOf("::", StringComparison.Ordinal);
        if (separator <= 0 || string.IsNullOrWhiteSpace(reference[..separator]) ||
            !Guid.TryParse(reference[(separator + 2)..], out var globalId) || globalId == Guid.Empty) {
            throw new InvalidOperationException($"Invalid stored geometry reference '{reference}'.");
        }
        return new(reference[..separator], globalId);
    }
}

/// <summary>References to all detailed features, separate from the rectangular AOI.</summary>
/// <param name="PointRef">The point reference when there is exactly one feature.</param>
/// <param name="CurveRef">The multipart line reference, if present.</param>
/// <param name="SurfaceRef">The polygon reference, if present.</param>
/// <param name="PointRefs">Every stored point feature, including members of a point set.</param>
public sealed record DetailedGeometryResponse(GeometryReferenceResponse? PointRef, GeometryReferenceResponse? CurveRef, GeometryReferenceResponse? SurfaceRef, IReadOnlyList<GeometryReferenceResponse> PointRefs)
{
    internal static DetailedGeometryResponse? FromState(DetailedGeometry? geometry) => geometry is null ? null : new(
        GeometryReferenceResponse.FromStoredReference(geometry.PointRef), GeometryReferenceResponse.FromStoredReference(geometry.CurveRef),
        GeometryReferenceResponse.FromStoredReference(geometry.SurfaceRef), geometry.PointRefs.Select(reference => GeometryReferenceResponse.FromStoredReference(reference)!).ToArray());
}
