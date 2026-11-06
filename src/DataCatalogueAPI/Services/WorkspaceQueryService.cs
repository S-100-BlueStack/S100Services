using DataCatalague.Api.Domain;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;

namespace DataCatalague.Api.Services;

/// <summary>Lists workspaces across pipelines using current ownership from their event streams.</summary>
public sealed class WorkspaceQueryService(IPipelineRepository pipelines, WorkspaceService workspaces)
{
    public async Task<PagedResponse<WorkspaceListResponse>> ListAsync(string? pipelineId, string? owner, bool? unassigned, string? currentUser, int page, int pageSize, CancellationToken cancellationToken) {
        if (page < 1 || pageSize is < 1 or > PackageRepository.MaximumPageSize) { throw new InvalidDataException("Page must be positive and pageSize must be from 1 to 200."); }
        if (owner is not null && (string.IsNullOrWhiteSpace(owner) || unassigned == true)) { throw new InvalidDataException("Supply a nonempty owner or unassigned=true, not both."); }
        if (owner is not null) {
            if (string.Equals(owner.Trim(), "current", StringComparison.OrdinalIgnoreCase)) {
                if (string.IsNullOrWhiteSpace(currentUser)) { throw new UnauthorizedAccessException("A signed-in username is required."); }
                owner = currentUser;
            }
            owner = Extensions.NormalizeUserName(owner);
            if (string.IsNullOrWhiteSpace(owner)) { throw new InvalidDataException("Supply a valid owner username."); }
        }
        if (pipelineId is not null && string.IsNullOrWhiteSpace(pipelineId)) { throw new InvalidDataException("Supply a valid pipeline identifier."); }
        var ids = pipelineId is null
            ? (await pipelines.GetPipelinesAsync(cancellationToken)).Select(p => p.Id!.Value).Order(StringComparer.Ordinal).ToArray()
            : [pipelineId];
        var result = new List<WorkspaceListResponse>();
        foreach (var id in ids) {
            // Subscription ownership may lag behind a just-completed claim or clear.
            var pipeline = await workspaces.GetPipelineAsync(id, cancellationToken);
            foreach (var workspace in pipeline.Workspaces.OrderBy(w => w.Id, StringComparer.Ordinal)) {
                cancellationToken.ThrowIfCancellationRequested();
                if (owner is not null && !string.Equals(workspace.Owner, owner, StringComparison.OrdinalIgnoreCase)) { continue; }
                if (unassigned is not null && (workspace.Owner is null) != unassigned.Value) { continue; }
                result.Add(new(id, pipeline.DisplayName, WorkspaceResponse.FromState(workspace)));
            }
        }
        var offset = ((long)page - 1) * pageSize;
        return new() { Items = offset >= result.Count ? [] : result.Skip((int)offset).Take(pageSize).ToArray(), TotalCount = result.Count, Page = page, PageSize = pageSize };
    }
}
