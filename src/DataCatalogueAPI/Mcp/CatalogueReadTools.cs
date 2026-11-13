using System.ComponentModel;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using Eventuous;
using ModelContextProtocol;
using ModelContextProtocol.Server;

namespace DataCatalague.Api.Mcp;

/// <summary>The complete MCP tool allowlist; no commands, uploads or arbitrary HTTP requests are exposed.</summary>
[McpServerToolType]
public sealed class CatalogueReadTools(IDataCatalogueReadService reads, IHttpContextAccessor httpContext, ILogger<CatalogueReadTools> logger)
{
    /// <summary>Lists package metadata with the existing REST filters.</summary>
    [McpServerTool(Name = "list_packages", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("List package metadata and active pipeline assignments, ordered by catalogue ID. Filter by category, intersecting AOI or pipeline assignment. Use get_package_geometry for coordinates.")]
    public Task<PagedResponse<PackageResponse>> ListPackages(CancellationToken cancellationToken, [Description("Exact category ID, or omit for all categories.")] string? category = null, [Description("Esri JSON envelope or polygon as a string, with spatialReference.wkid or wkt; at most 16384 characters.")] string? geometry = null, [Description("One-based page number.")] int page = 1, [Description("Results per page, from 1 to 200.")] int pageSize = 20, [Description("True for assigned packages, false for unassigned; omit for both.")] bool? hasPipeline = null, [Description("Exact pipeline ID; may be combined with the other filters.")] string? pipelineId = null) => ReadAsync("list_packages", () => {
        ValidateFilters(category, geometry, pipelineId, page, pageSize);
        return reads.GetPackagesAsync(category, geometry, page, pageSize, hasPipeline, pipelineId, cancellationToken);
    }, cancellationToken);

    /// <summary>Reads one package's metadata and pipeline assignments.</summary>
    [McpServerTool(Name = "get_package", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("Get current metadata and all active pipeline assignments for one catalogue package. The ID comes from list_packages; it is not the shortId.")]
    public Task<PackageResponse> GetPackage([Description("Catalogue package ID.")] string packageId, CancellationToken cancellationToken) => ReadAsync("get_package", () => {
        ValidateId(packageId, nameof(packageId));
        return reads.GetPackageAsync(packageId, cancellationToken);
    }, cancellationToken);

    /// <summary>Lists a bounded page of pipelines.</summary>
    [McpServerTool(Name = "list_pipelines", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("List pipelines and their workspace summaries in catalogue ID order. Returns pagination metadata and the total count.")]
    public Task<PagedResponse<PipelineResponse>> ListPipelines(CancellationToken cancellationToken, [Description("One-based page number.")] int page = 1, [Description("Results per page, from 1 to 200.")] int pageSize = 20) => ReadAsync("list_pipelines", () => {
        ValidatePage(page, pageSize);
        return reads.GetPipelinesAsync(page, pageSize, cancellationToken);
    }, cancellationToken);

    /// <summary>Reads current pipeline state.</summary>
    [McpServerTool(Name = "get_pipeline", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("Get one pipeline with its current workspace summaries and ownership. Use get_workspace for the workspace polygon.")]
    public Task<PipelineResponse> GetPipeline([Description("Pipeline ID from list_pipelines.")] string pipelineId, CancellationToken cancellationToken) => ReadAsync("get_pipeline", () => {
        ValidateId(pipelineId, nameof(pipelineId));
        return reads.GetPipelineAsync(pipelineId, cancellationToken);
    }, cancellationToken);

    /// <summary>Lists workspaces and current responsibility owners.</summary>
    [McpServerTool(Name = "list_workspaces", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("List workspaces across pipelines. Filter by pipeline and owner, or by assignment status. owner='current' uses the authenticated Windows user; it never accepts a caller-supplied identity.")]
    public Task<PagedResponse<WorkspaceListResponse>> ListWorkspaces(CancellationToken cancellationToken, [Description("Exact pipeline ID, or omit for all pipelines.")] string? pipelineId = null, [Description("Owner username or 'current'. Cannot combine with unassigned=true.")] string? owner = null, [Description("True for unowned workspaces, false for owned; omit for both.")] bool? unassigned = null, [Description("One-based page number.")] int page = 1, [Description("Results per page, from 1 to 200.")] int pageSize = 20) => ReadAsync("list_workspaces", () => {
        ValidateFilters(null, null, pipelineId, page, pageSize);
        ValidateOptionalText(owner, nameof(owner));
        if (owner is not null && unassigned == true) { throw new McpException("Supply owner or unassigned=true, not both."); }
        var identity = httpContext.HttpContext?.User.Identity;
        var username = identity?.IsAuthenticated == true ? identity.Name : null;
        return reads.GetWorkspacesAsync(pipelineId, owner, unassigned, username, page, pageSize, cancellationToken);
    }, cancellationToken);

    /// <summary>Reads a workspace with its polygon.</summary>
    [McpServerTool(Name = "get_workspace", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("Get a workspace summary and its complete Esri JSON coverage polygon, including spatial reference. Requires both pipeline ID and workspace ID from list_workspaces.")]
    public Task<WorkspaceDetailResponse> GetWorkspace([Description("Pipeline ID containing the workspace.")] string pipelineId, [Description("Workspace GUID from list_workspaces.")] string workspaceId, CancellationToken cancellationToken) => ReadAsync("get_workspace", () => {
        ValidateWorkspace(pipelineId, workspaceId);
        return reads.GetWorkspaceAsync(pipelineId, workspaceId, cancellationToken);
    }, cancellationToken);

    /// <summary>Lists bound packages intersecting a workspace.</summary>
    [McpServerTool(Name = "list_workspace_packages", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("List packages bound to the pipeline whose current AOIs intersect the workspace. Returns package IDs, short IDs and simple Esri JSON AOIs; use get_package for metadata.")]
    public Task<PagedResponse<WorkspacePackageResponse>> ListWorkspacePackages([Description("Pipeline ID containing the workspace.")] string pipelineId, [Description("Workspace GUID from list_workspaces.")] string workspaceId, CancellationToken cancellationToken, [Description("One-based page number.")] int page = 1, [Description("Results per page, from 1 to 200.")] int pageSize = 20) => ReadAsync("list_workspace_packages", () => {
        ValidateWorkspace(pipelineId, workspaceId);
        ValidatePage(page, pageSize);
        return reads.GetWorkspacePackagesAsync(pipelineId, workspaceId, page, pageSize, cancellationToken);
    }, cancellationToken);

    /// <summary>Reads one package's AOI and complete detailed geometry.</summary>
    [McpServerTool(Name = "get_package_geometry", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("Get a package's current AOI and nullable detailedGeometry containing points, curves and surfaces. Geometry is returned as Esri JSON objects in their stored spatial references.")]
    public Task<PackageGeometryResponse> GetPackageGeometry([Description("Catalogue package ID from list_packages.")] string packageId, CancellationToken cancellationToken) => ReadAsync("get_package_geometry", () => {
        ValidateId(packageId, nameof(packageId));
        return reads.GetPackageGeometryAsync(packageId, cancellationToken);
    }, cancellationToken);

    /// <summary>Lists a filtered page of current package geometries.</summary>
    [McpServerTool(Name = "list_package_geometries", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false, UseStructuredContent = true)]
    [Description("List package IDs and current Esri JSON AOIs with category, spatial and pipeline filters. Only the selected page is hydrated. Detailed coordinates are omitted unless includeDetails=true.")]
    public Task<PagedResponse<PackageGeometryItemResponse>> ListPackageGeometries(CancellationToken cancellationToken, [Description("Exact category ID, or omit for all categories.")] string? category = null, [Description("Esri JSON envelope or polygon as a string, with spatialReference.wkid or wkt; at most 16384 characters.")] string? geometry = null, [Description("One-based page number.")] int page = 1, [Description("Results per page, from 1 to 200.")] int pageSize = 20, [Description("True for assigned packages, false for unassigned; omit for both.")] bool? hasPipeline = null, [Description("Exact pipeline ID, combined with the other filters.")] string? pipelineId = null, [Description("Include all points, curves and surfaces for each package; defaults to false.")] bool includeDetails = false) => ReadAsync("list_package_geometries", () => {
        ValidateFilters(category, geometry, pipelineId, page, pageSize);
        return reads.GetPackageGeometriesAsync(category, geometry, page, pageSize, hasPipeline, pipelineId, includeDetails, cancellationToken);
    }, cancellationToken);

    private async Task<T> ReadAsync<T>(string tool, Func<Task<T>> read, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        try {
            return await read();
        }
        catch (Exception exception) when (exception is KeyNotFoundException or StreamNotFound) {
            throw new McpException("The requested catalogue resource was not found.");
        }
        catch (InvalidDataException) {
            // ArcGIS and persistence exceptions can include paths or connection details.
            throw new McpException("Invalid catalogue filter or identifier. Geometry must be an Esri JSON envelope or polygon with an explicit spatial reference.");
        }
        catch (UnauthorizedAccessException) {
            throw new McpException("A signed-in username is required to resolve owner='current'.");
        }
        catch (Exception exception) when (exception is not OperationCanceledException and not McpException) {
            logger.LogError(exception, "MCP catalogue read failed. Tool: {Tool}.", tool);
            throw new McpException("Could not read the catalogue resource.");
        }
    }

    private static void ValidatePage(int page, int pageSize) {
        if (page < 1 || pageSize is < 1 or > 200) { throw new McpException("page must be positive and pageSize must be from 1 to 200."); }
    }

    private static void ValidateId(string? value, string name) {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 256) { throw new McpException($"{name} must contain from 1 to 256 non-whitespace characters."); }
    }

    private static void ValidateOptionalText(string? value, string name) {
        if (value is not null) { ValidateId(value, name); }
    }

    private static void ValidateWorkspace(string pipelineId, string workspaceId) {
        ValidateId(pipelineId, nameof(pipelineId));
        if (!Guid.TryParse(workspaceId, out _)) { throw new McpException("workspaceId must be a workspace GUID from list_workspaces."); }
    }

    private static void ValidateFilters(string? category, string? geometry, string? pipelineId, int page, int pageSize) {
        ValidatePage(page, pageSize);
        ValidateOptionalText(category, nameof(category));
        ValidateOptionalText(pipelineId, nameof(pipelineId));
        if (geometry is not null && (string.IsNullOrWhiteSpace(geometry) || geometry.Length > 16384)) { throw new McpException("geometry must contain from 1 to 16384 characters of Esri JSON."); }
    }
}
