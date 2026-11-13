using DataCatalague.Api.Domain;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;

namespace DataCatalague.Api.Services;

/// <summary>Adapts the existing catalogue projections and geometry readers to the read-only client contract.</summary>
public sealed class DataCatalogueReadService(PackageRepository packages, IPipelineRepository pipelines, PipelineAssignmentIndex assignments, IEventStore events, StreamNameMap streams, PackageGeometryService geometry, WorkspaceService workspaces, WorkspaceQueryService workspaceQueries) : IDataCatalogueReadService
{
    /// <inheritdoc/>
    public async Task<PagedResponse<PackageResponse>> GetPackagesAsync(string? category, string? geometry, int page, int pageSize, bool? hasPipeline, string? pipelineId, CancellationToken cancellationToken) {
        var result = await packages.GetPackagesAsync(category, cancellationToken, geometry, page, pageSize, hasPipeline, pipelineId);
        return new() { Items = result.Items.Select(MapPackage).ToArray(), Page = page, PageSize = pageSize, TotalCount = result.TotalCount };
    }

    /// <inheritdoc/>
    public async Task<PackageResponse> GetPackageAsync(string packageId, CancellationToken cancellationToken) {
        if (!await events.StreamExists(streams.GetStreamName(new PackageId(packageId)), cancellationToken)) { throw new KeyNotFoundException("Package not found."); }
        var result = await events.LoadState<PackageState, PackageId>(streams, new(packageId), true, cancellationToken);
        return MapPackage(result.State);
    }

    /// <inheritdoc/>
    public async Task<PagedResponse<PipelineResponse>> GetPipelinesAsync(int page, int pageSize, CancellationToken cancellationToken) {
        var result = await pipelines.GetPipelinesAsync(cancellationToken);
        var offset = ((long)page - 1) * pageSize;
        var items = offset >= result.Count ? Array.Empty<PipelineResponse>() : result.OrderBy(pipeline => pipeline.Id!.Value, StringComparer.Ordinal).Skip((int)offset).Take(pageSize).Select(MapPipeline).ToArray();
        return new() { Items = items, Page = page, PageSize = pageSize, TotalCount = result.Count };
    }

    /// <inheritdoc/>
    public async Task<PipelineResponse> GetPipelineAsync(string pipelineId, CancellationToken cancellationToken) => MapPipeline(await workspaces.GetPipelineAsync(pipelineId, cancellationToken));

    /// <inheritdoc/>
    public Task<PagedResponse<WorkspaceListResponse>> GetWorkspacesAsync(string? pipelineId, string? owner, bool? unassigned, string? currentUser, int page, int pageSize, CancellationToken cancellationToken) => workspaceQueries.ListAsync(pipelineId, owner, unassigned, currentUser, page, pageSize, cancellationToken);

    /// <inheritdoc/>
    public Task<WorkspaceDetailResponse> GetWorkspaceAsync(string pipelineId, string workspaceId, CancellationToken cancellationToken) => workspaces.GetWorkspaceAsync(pipelineId, workspaceId, cancellationToken);

    /// <inheritdoc/>
    public Task<PagedResponse<WorkspacePackageResponse>> GetWorkspacePackagesAsync(string pipelineId, string workspaceId, int page, int pageSize, CancellationToken cancellationToken) => workspaces.GetPackagesAsync(pipelineId, workspaceId, page, pageSize, cancellationToken);

    /// <inheritdoc/>
    public async Task<PackageGeometryResponse> GetPackageGeometryAsync(string packageId, CancellationToken cancellationToken) => await geometry.GetAsync(packageId, cancellationToken) ?? throw new KeyNotFoundException("Package not found.");

    /// <inheritdoc/>
    public Task<PagedResponse<PackageGeometryItemResponse>> GetPackageGeometriesAsync(string? category, string? geometryFilter, int page, int pageSize, bool? hasPipeline, string? pipelineId, bool includeDetails, CancellationToken cancellationToken) => geometry.GetPageAsync(category, cancellationToken, geometryFilter, page, pageSize, hasPipeline, pipelineId, includeDetails);

    // Match the REST contract, including its public archive URI and assignment IDs;
    // geometry references and internal filesystem locations are not additional MCP fields.
    private PackageResponse MapPackage(PackageState state) => new() {
        Id = state.Id!,
        Category = state.Category,
        FileName = state.FileName,
        AbsoluteUri = state.AbsoluteUri?.Scheme == "database" ? state.AbsoluteUri.GetLeftPart(UriPartial.Authority) : state.AbsoluteUri?.AbsolutePath,
        Severity = state.Severity,
        MetaData = state.MetaData,
        Descriptions = state.Descriptions,
        Charts = state.Charts,
        DisplayScale = state.DisplayScale,
        LastUpdatedUtc = state.LastUpdatedUtc,
        PipelineBindings = assignments.GetPipelines(state.Id!.Value).Select(pipelineId => new PackagePipelineBindingResponse($"{state.Id.Value}::{pipelineId}", pipelineId)).ToArray(),
    };

    private static PipelineResponse MapPipeline(PipelineState state) => new() {
        Id = state.Id!,
        DisplayName = state.DisplayName,
        Description = state.Description,
        LastUpdatedUtc = state.LastUpdatedUtc,
        Workspaces = state.Workspaces.Select(WorkspaceResponse.FromState).ToArray(),
    };
}
