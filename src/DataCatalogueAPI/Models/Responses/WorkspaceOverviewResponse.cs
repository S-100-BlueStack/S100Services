using DataCatalague.Api.Models;

namespace DataCatalague.Api.Models.V1;

/// <summary>A Workspace's complete polygon and first page of current, Pipeline-bound Package memberships.</summary>
/// <remarks>
/// A null geometry or Package page indicates that part of the read failed; it never represents
/// an empty Workspace or zero Package matches. Clients should retry the existing individual route.
/// </remarks>
public sealed record WorkspaceOverviewResponse(
    WorkspaceResponse Workspace,
    string? EsriJSON,
    PagedResponse<WorkspacePackageResponse>? Packages);
