using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1;

/// <summary>A workspace, its coverage reference and its current responsibility owner.</summary>
public sealed record WorkspaceResponse(string Id, string DisplayName, DisplayScale DisplayScale, GeometryReferenceResponse GeometryRef, string? Owner, DateTimeOffset? LockedAtUtc)
{
    internal static WorkspaceResponse FromState(Workspace workspace) => new(workspace.Id, workspace.DisplayName, workspace.DisplayScale, GeometryReferenceResponse.FromStoredReference(workspace.GeometryRef)!, workspace.Owner, workspace.LockedAtUtc);
}

/// <summary>A bound package whose rectangular AOI intersects the workspace.</summary>
public sealed record WorkspacePackageResponse(string PackageId, string? ShortId);

/// <summary>A workspace and its complete coverage polygon.</summary>
public sealed record WorkspaceDetailResponse(WorkspaceResponse Workspace, string EsriJSON);
