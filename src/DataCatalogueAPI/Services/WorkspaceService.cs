using ArcGIS.Core.Geometry;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;
using System.Text.Json;
using System.Diagnostics;

namespace DataCatalague.Api.Services;

/// <summary>Coordinates pipeline workspace events and geometry operations on the ArcGIS thread.</summary>
public sealed class WorkspaceService(IEventStore eventStore, StreamNameMap streams, ICommandService<PipelineState> commands, DispatchRepository coverage, PackageRepository packages, ArcGisDispatcher dispatcher, ILogger<WorkspaceService> logger)
{
    // The current host has one in-memory event store. Eventuous still checks stream
    // versions; this gate also prevents two local requests allocating duplicate coverage.
    private static readonly SemaphoreSlim MutationGate = new(1, 1);

    /// <summary>Loads the current pipeline directly, including writes not yet projected by the subscription.</summary>
    public async Task<PipelineState> GetPipelineAsync(string pipelineId, CancellationToken cancellationToken) {
        if (!await eventStore.StreamExists(streams.GetStreamName(new PipelineId(pipelineId)), cancellationToken)) { throw new KeyNotFoundException("Pipeline not found."); }
        var stream = await eventStore.LoadState<PipelineState, PipelineId>(streams, new(pipelineId), true, cancellationToken);
        return stream.State;
    }

    /// <summary>Creates validated workspace geometry, then records its reference in the pipeline.</summary>
    public async Task<PipelineState> CreateAsync(string pipelineId, AddWorkspaceRequest request, CancellationToken cancellationToken) {
        if (request is null || string.IsNullOrWhiteSpace(request.DisplayName) || request.DisplayName.Trim().Length > 200 || string.IsNullOrWhiteSpace(request.EsriJSON) || request.EsriJSON.Length > 1_000_000
            || request.DisplayScale is null || request.DisplayScale.maximumDisplayScale <= 0 || request.DisplayScale.minimumDisplayScale < request.DisplayScale.maximumDisplayScale) {
            throw new InvalidDataException("Supply a workspace name (up to 200 characters), polygon Esri JSON (up to 1 MB) and a valid display-scale range.");
        }
        await MutationGate.WaitAsync(cancellationToken);
        try {
            var pipeline = await GetPipelineAsync(pipelineId, cancellationToken);
            var name = request.DisplayName.Trim();
            if (pipeline.Workspaces.Any(w => string.Equals(w.DisplayName, name, StringComparison.OrdinalIgnoreCase))) { throw new WorkspaceConflictException("A workspace with this name already exists in the pipeline."); }
            var reference = await dispatcher.ExecuteAsync(() => {
                try {
                    var polygon = ParsePolygon(request.EsriJSON);
                    return coverage.AddWorkspaceAOI(polygon, pipelineId, name, cancellationToken);
                }
                catch (Exception exception) when (exception is ArcGIS.Core.Geometry.Exceptions.GeometryException or ArgumentException) {
                    throw new InvalidDataException("Workspace polygon cannot be projected or stored in the coverage spatial reference.", exception);
                }
            });
            try {
                // Finish recording committed coverage even if the caller disconnects.
                var result = await commands.Handle(new PipelineCommands.CreateWorkspace(pipelineId, name, request.DisplayScale, reference), CancellationToken.None);
                if (!result.Success) { throw new WorkspaceConflictException("Pipeline changed while creating the workspace; retry the request."); }
                logger.LogInformation("Created workspace. PipelineId: {PipelineId}, WorkspaceGeometry: {GeometryRef}.", pipelineId, reference);
                return result.Get()!.State;
            }
            catch (Exception exception) {
                // An event-store failure may be ambiguous. Delete only after confirming
                // that the current stream does not reference the newly written coverage.
                try {
                    var current = await GetPipelineAsync(pipelineId, CancellationToken.None);
                    if (!current.Workspaces.Any(w => w.GeometryRef == reference)) {
                        await dispatcher.ExecuteAsync(() => { coverage.DeleteWorkspaceGeometry(reference); return true; });
                    }
                }
                catch (Exception cleanupException) {
                    logger.LogError(cleanupException, "Could not verify or clean up workspace coverage after event failure. PipelineId: {PipelineId}, GeometryRef: {GeometryRef}.", pipelineId, reference);
                }
                logger.LogError(exception, "Could not record workspace creation. PipelineId: {PipelineId}, GeometryRef: {GeometryRef}.", pipelineId, reference);
                throw;
            }
        }
        finally { MutationGate.Release(); }
    }

    /// <summary>Claims or clears a workspace; returns null when it does not belong to the pipeline.</summary>
    public async Task<PipelineState?> SetLockAsync(string pipelineId, string workspaceId, string username, bool locked, CancellationToken cancellationToken) {
        username = Extensions.NormalizeUserName(username);
        ArgumentException.ThrowIfNullOrWhiteSpace(username);
        await MutationGate.WaitAsync(cancellationToken);
        try {
            var pipeline = await GetPipelineAsync(pipelineId, cancellationToken);
            if (!Guid.TryParse(workspaceId, out var parsedId)) { throw new InvalidDataException("Workspace ID must be a GUID."); }
            var workspace = pipeline.Workspaces.SingleOrDefault(w => w.Id == parsedId.ToString("D"));
            if (workspace is null) {
                logger.LogWarning("Workspace does not belong to the requested pipeline. PipelineId: {PipelineId}, WorkspaceId: {WorkspaceId}, AvailableWorkspaceIds: {AvailableWorkspaceIds}.", pipelineId, workspaceId, string.Join(", ", pipeline.Workspaces.Select(w => w.Id)));
                return null;
            }
            if (locked && workspace.Owner == username || !locked && workspace.Owner is null) { return pipeline; }
            // Eventuous dispatches using the generic command type. Handle each concrete
            // command before combining the results; an object-typed command has no handler.
            var result = locked
                ? await commands.Handle(new PipelineCommands.LockWorkspace(pipelineId, workspace.Id, username), cancellationToken)
                : await commands.Handle(new PipelineCommands.UnlockWorkspace(pipelineId, workspace.Id, username), cancellationToken);
            if (!result.Success) {
                logger.LogError(result.Exception, "Workspace ownership command failed. PipelineId: {PipelineId}, WorkspaceId: {WorkspaceId}, User: {User}, Assigned: {Assigned}.", pipelineId, workspace.Id, username, locked);
                if (result.Exception is WrongVersion) {
                    throw new WorkspaceConflictException("Pipeline changed while updating workspace ownership; retry the request.");
                }
                result.ThrowIfError();
            }
            logger.LogInformation("Updated workspace ownership. PipelineId: {PipelineId}, WorkspaceId: {WorkspaceId}, User: {User}, PreviousOwner: {PreviousOwner}, Owner: {Owner}.", pipelineId, workspace.Id, username, workspace.Owner, locked ? username : null);
            return result.Get()!.State;
        }
        finally { MutationGate.Release(); }
    }

    /// <summary>Returns workspaces whose geometry intersects the package rectangular AOI in this pipeline.</summary>
    public async Task<IReadOnlyList<WorkspaceResponse>> GetIntersectionsAsync(string packageId, string pipelineId, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var total = Stopwatch.StartNew();
        var eventStateMs = 0.0;
        var queueWaitMs = 0.0;
        var geometryReadMs = 0.0;
        var intersectionMs = 0.0;
        var workspaceCount = 0;
        var matchCount = 0;
        var outcome = "Failed";
        try {
            var pipeline = await GetPipelineAsync(pipelineId, cancellationToken);
            if (!await eventStore.StreamExists(streams.GetStreamName(new PackageId(packageId)), cancellationToken)) { throw new KeyNotFoundException("Package not found."); }
            var package = await eventStore.LoadState<PackageState, PackageId>(streams, new(packageId), true, cancellationToken);
            eventStateMs = total.Elapsed.TotalMilliseconds;
            var workspaces = pipeline.Workspaces;
            workspaceCount = workspaces.Count();
            var references = workspaces.Select(workspace => workspace.GeometryRef).ToArray();
            var queuedAt = Stopwatch.GetTimestamp();
            var matches = await dispatcher.ExecuteAsync<IReadOnlyList<WorkspaceResponse>>(() => {
                queueWaitMs = Stopwatch.GetElapsedTime(queuedAt).TotalMilliseconds;
                cancellationToken.ThrowIfCancellationRequested();
                var geometryTimer = Stopwatch.StartNew();
                IReadOnlyList<Polygon> geometries;
                try { geometries = coverage.GetWorkspaceGeometries(references, cancellationToken); }
                finally { geometryReadMs = geometryTimer.Elapsed.TotalMilliseconds; }
                var intersectionTimer = Stopwatch.StartNew();
                IReadOnlyList<bool> intersections;
                try {
                    intersections = geometries.Count == 0
                        ? Array.Empty<bool>()
                        : packages.AoiIntersectsWorkspaces(package.State.GeometryRef ?? throw new InvalidOperationException("Package has no rectangular AOI reference."), geometries, cancellationToken);
                }
                finally { intersectionMs = intersectionTimer.Elapsed.TotalMilliseconds; }
                var result = new List<WorkspaceResponse>();
                for (var index = 0; index < workspaces.Count(); index++) {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (intersections[index]) { result.Add(WorkspaceResponse.FromState(workspaces[index])); }
                }
                return result;
            });
            matchCount = matches.Count;
            outcome = "Succeeded";
            return matches;
        }
        catch (OperationCanceledException) {
            outcome = "Canceled";
            throw;
        }
        finally {
            if (eventStateMs == 0) { eventStateMs = total.Elapsed.TotalMilliseconds; }
            logger.LogInformation(
                "Workspace intersection read {Outcome}. PipelineId: {PipelineId}, Workspaces: {WorkspaceCount}, Matches: {MatchCount}, EventStateMs: {EventStateMs}, ArcGisQueueWaitMs: {ArcGisQueueWaitMs}, WorkspaceGeometryMs: {WorkspaceGeometryMs}, AoiIntersectionMs: {AoiIntersectionMs}, TotalMs: {TotalMs}.",
                outcome, pipelineId, workspaceCount, matchCount, eventStateMs, queueWaitMs, geometryReadMs, intersectionMs, total.Elapsed.TotalMilliseconds);
        }
    }

    /// <summary>Returns a workspace with its complete polygon in Esri JSON.</summary>
    public async Task<WorkspaceDetailResponse> GetWorkspaceAsync(string pipelineId, string workspaceId, CancellationToken cancellationToken) {
        var workspace = FindWorkspace(await GetPipelineAsync(pipelineId, cancellationToken), workspaceId);
        var json = await dispatcher.ExecuteAsync(() => coverage.GetWorkspaceGeometry(workspace.GeometryRef, cancellationToken).ToJson());
        return new(WorkspaceResponse.FromState(workspace), json);
    }

    /// <summary>Returns a page of bound packages whose current rectangular AOIs intersect this workspace.</summary>
    public async Task<PagedResponse<WorkspacePackageResponse>> GetPackagesAsync(string pipelineId, string workspaceId, int page, int pageSize, CancellationToken cancellationToken) {
        if (page < 1 || pageSize is < 1 or > PackageRepository.MaximumPageSize) { throw new InvalidDataException("Page must be positive and pageSize must be from 1 to 200."); }
        cancellationToken.ThrowIfCancellationRequested();
        var total = Stopwatch.StartNew();
        var eventStateMs = 0.0;
        var queueWaitMs = 0.0;
        var workspaceGeometryMs = 0.0;
        var spatialQueryMs = 0.0;
        var packageHydrationMs = 0.0;
        var responseBuildMs = 0.0;
        var matchCount = 0;
        var returnedCount = 0;
        var outcome = "Failed";
        try {
            var workspace = FindWorkspace(await GetPipelineAsync(pipelineId, cancellationToken), workspaceId);
            eventStateMs = total.Elapsed.TotalMilliseconds;
            var queuedAt = Stopwatch.GetTimestamp();
            var pageData = await dispatcher.ExecuteAsync(() => {
                queueWaitMs = Stopwatch.GetElapsedTime(queuedAt).TotalMilliseconds;
                cancellationToken.ThrowIfCancellationRequested();
                var geometryTimer = Stopwatch.StartNew();
                Polygon polygon;
                try { polygon = coverage.GetWorkspaceGeometry(workspace.GeometryRef, cancellationToken); }
                finally { workspaceGeometryMs = geometryTimer.Elapsed.TotalMilliseconds; }
                return packages.ReadWorkspacePackagePage(pipelineId, polygon, page, pageSize, cancellationToken, out spatialQueryMs, out packageHydrationMs);
            });
            matchCount = pageData.TotalCount;
            var responseTimer = Stopwatch.StartNew();
            IReadOnlyList<WorkspacePackageResponse> items;
            try {
                items = pageData.Items.Select(item => new WorkspacePackageResponse(
                    item.PackageId, item.ShortId, JsonSerializer.Deserialize<JsonElement>(item.AoiJson))).ToArray();
            }
            finally { responseBuildMs = responseTimer.Elapsed.TotalMilliseconds; }
            cancellationToken.ThrowIfCancellationRequested();
            returnedCount = items.Count;
            outcome = "Succeeded";
            return new PagedResponse<WorkspacePackageResponse> { Items = items, Page = page, PageSize = pageSize, TotalCount = matchCount };
        }
        catch (OperationCanceledException) {
            outcome = "Canceled";
            throw;
        }
        finally {
            logger.LogInformation(
                "Workspace packages read {Outcome}. PipelineId: {PipelineId}, WorkspaceId: {WorkspaceId}, Page: {Page}, PageSize: {PageSize}, Matches: {MatchCount}, Returned: {ReturnedCount}, EventStateMs: {EventStateMs}, ArcGisQueueWaitMs: {ArcGisQueueWaitMs}, WorkspaceGeometryMs: {WorkspaceGeometryMs}, SpatialQueryMs: {SpatialQueryMs}, PackageHydrationMs: {PackageHydrationMs}, ResponseBuildMs: {ResponseBuildMs}, TotalMs: {TotalMs}.",
                outcome, pipelineId, workspaceId, page, pageSize, matchCount, returnedCount, eventStateMs, queueWaitMs, workspaceGeometryMs, spatialQueryMs, packageHydrationMs, responseBuildMs, total.Elapsed.TotalMilliseconds);
        }
    }

    private static Workspace FindWorkspace(PipelineState pipeline, string workspaceId) {
        if (!Guid.TryParse(workspaceId, out var id)) { throw new InvalidDataException("Workspace ID must be a GUID."); }
        return pipeline.Workspaces.SingleOrDefault(w => w.Id == id.ToString("D")) ?? throw new KeyNotFoundException("Workspace not found in this pipeline.");
    }

    private static Polygon ParsePolygon(string json) {
        try {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("spatialReference", out var sr) || sr.ValueKind != JsonValueKind.Object
                || (!sr.TryGetProperty("wkid", out _) && !sr.TryGetProperty("wkt", out _))
                || (!root.TryGetProperty("rings", out _) && !root.TryGetProperty("curveRings", out _))) {
                throw new InvalidDataException("Supply an Esri JSON polygon with rings and a known spatialReference.");
            }
            var polygon = PolygonBuilderEx.FromJson(json);
            if (polygon.IsEmpty || polygon.SpatialReference is null || polygon.SpatialReference.IsUnknown || !double.IsFinite(polygon.Area) || polygon.Area == 0
                || polygon.Points.Any(p => !double.IsFinite(p.X) || !double.IsFinite(p.Y)) || !GeometryEngine.Instance.IsSimpleAsFeature(polygon)) {
                throw new InvalidDataException("Workspace geometry must be a nonempty, simple polygon with finite coordinates and a known spatial reference.");
            }
            return polygon;
        }
        catch (Exception exception) when (exception is JsonException or ArcGIS.Core.Geometry.Exceptions.GeometryException or ArgumentException) {
            throw new InvalidDataException("Invalid workspace Esri JSON polygon.", exception);
        }
    }
}
