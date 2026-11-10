using ArcGIS.Core.Geometry;

namespace DataCatalague.Api.Repositories;

// ArcGIS geometries and exceptions stay within the dispatcher action; only JSON strings
// are returned to callers, so MVC never needs to own a geodatabase or feature handle.
internal sealed record WorkspaceGeometryRead(string Reference, CancellationToken CancellationToken);
internal sealed record WorkspaceGeometryReadResult(Polygon? Geometry, double ReadMs, Exception? Error);
internal sealed record WorkspacePackagePageQuery(string PipelineId, Polygon Geometry, int Page, int PageSize, CancellationToken CancellationToken);
internal sealed record WorkspacePackagePageReadResult(
    IReadOnlyList<(string PackageId, string? ShortId, string AoiJson)> Items,
    int TotalCount,
    double SpatialQueryMs,
    double PackageHydrationMs,
    Exception? Error);
