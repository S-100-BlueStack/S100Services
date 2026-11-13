using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;

namespace DataCatalague.Api.Services;

/// <summary>Read operations available to catalogue clients without a command or mutation contract.</summary>
public interface IDataCatalogueReadService
{
    /// <summary>Lists package metadata using the existing category, spatial and assignment filters.</summary>
    Task<PagedResponse<PackageResponse>> GetPackagesAsync(string? category, string? geometry, int page, int pageSize, bool? hasPipeline, string? pipelineId, CancellationToken cancellationToken);

    /// <summary>Reads current package metadata and active pipeline assignments.</summary>
    Task<PackageResponse> GetPackageAsync(string packageId, CancellationToken cancellationToken);

    /// <summary>Lists pipelines in identifier order.</summary>
    Task<PagedResponse<PipelineResponse>> GetPipelinesAsync(int page, int pageSize, CancellationToken cancellationToken);

    /// <summary>Reads a pipeline's current state and workspace ownership.</summary>
    Task<PipelineResponse> GetPipelineAsync(string pipelineId, CancellationToken cancellationToken);

    /// <summary>Lists workspaces with optional pipeline and ownership filters.</summary>
    Task<PagedResponse<WorkspaceListResponse>> GetWorkspacesAsync(string? pipelineId, string? owner, bool? unassigned, string? currentUser, int page, int pageSize, CancellationToken cancellationToken);

    /// <summary>Reads a workspace and its complete Esri JSON coverage polygon.</summary>
    Task<WorkspaceDetailResponse> GetWorkspaceAsync(string pipelineId, string workspaceId, CancellationToken cancellationToken);

    /// <summary>Lists bound packages whose AOIs intersect the workspace.</summary>
    Task<PagedResponse<WorkspacePackageResponse>> GetWorkspacePackagesAsync(string pipelineId, string workspaceId, int page, int pageSize, CancellationToken cancellationToken);

    /// <summary>Reads a package's AOI and all stored detail groups.</summary>
    Task<PackageGeometryResponse> GetPackageGeometryAsync(string packageId, CancellationToken cancellationToken);

    /// <summary>Filters and pages packages before hydrating their current geometry.</summary>
    Task<PagedResponse<PackageGeometryItemResponse>> GetPackageGeometriesAsync(string? category, string? geometry, int page, int pageSize, bool? hasPipeline, string? pipelineId, bool includeDetails, CancellationToken cancellationToken);
}
