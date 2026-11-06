using DataCatalague.Api.Domain;
using System.Text.Json;

namespace DataCatalague.Api.Models.V1;

/// <summary>A workspace and its current responsibility owner.</summary>
public sealed record WorkspaceResponse(string Id, string DisplayName, DisplayScale DisplayScale, string? Owner, DateTimeOffset? LockedAtUtc)
{
    internal static WorkspaceResponse FromState(Workspace workspace) => new(workspace.Id, workspace.DisplayName, workspace.DisplayScale, workspace.Owner, workspace.LockedAtUtc);
}

/// <summary>A bound package whose rectangular AOI intersects the workspace.</summary>
/// <param name="PackageId">The catalogue package identifier.</param>
/// <param name="ShortId">The source-facing package identifier.</param>
/// <param name="Aoi">The current simple package AOI as an Esri JSON object with its stored spatial reference.</param>
public sealed record WorkspacePackageResponse(string PackageId, string? ShortId, JsonElement Aoi);

/// <summary>A workspace and its complete coverage polygon.</summary>
public sealed record WorkspaceDetailResponse(WorkspaceResponse Workspace, string EsriJSON);

/// <summary>A workspace with the pipeline identifiers needed to open its package list.</summary>
public sealed record WorkspaceListResponse(string PipelineId, string PipelineDisplayName, WorkspaceResponse Workspace);
