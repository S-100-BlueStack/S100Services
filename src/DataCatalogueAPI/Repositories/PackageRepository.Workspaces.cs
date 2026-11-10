using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using DataCatalague.Api.Domain;
using System.Diagnostics;

namespace DataCatalague.Api.Repositories;

public partial class PackageRepository
{
    /// <summary>Reads one Workspace using the same semantics as a multi-Workspace batch.</summary>
    internal (IReadOnlyList<(string PackageId, string? ShortId, string AoiJson)> Items, int TotalCount) ReadWorkspacePackagePage(
        string pipelineId, Polygon workspace, int page, int pageSize, CancellationToken cancellationToken,
        out double spatialQueryMs, out double packageHydrationMs) {
        var result = this.ReadWorkspacePackagePages([new(pipelineId, workspace, page, pageSize, cancellationToken)], out _)[0];
        spatialQueryMs = result.SpatialQueryMs;
        packageHydrationMs = result.PackageHydrationMs;
        if (result.Error is { } exception) { System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(exception).Throw(); }
        return (result.Items, result.TotalCount);
    }

    /// <summary>Reads independent Workspace package pages with one connection and spatial feature class.</summary>
    internal IReadOnlyList<WorkspacePackagePageReadResult> ReadWorkspacePackagePages(
        IReadOnlyList<WorkspacePackagePageQuery> reads, out double scopeOpenMs) {
        ArgumentNullException.ThrowIfNull(reads);
        scopeOpenMs = 0;
        if (reads.Count == 0) { return []; }
        var setup = Stopwatch.StartNew();
        using var connector = this.createGeodatabase();
        using var fc = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName());
        using var definition = fc.GetDefinition();
        scopeOpenMs = setup.Elapsed.TotalMilliseconds;
        var results = new WorkspacePackagePageReadResult[reads.Count];

        for (var index = 0; index < reads.Count; index++) {
            var read = reads[index];
            var spatialQueryMs = 0.0;
            var packageHydrationMs = 0.0;
            try {
                read.CancellationToken.ThrowIfCancellationRequested();
                var queryTimer = Stopwatch.StartNew();
                IReadOnlyList<PackageState> matches;
                try {
                    matches = this.FindWorkspacePackages(read.PipelineId, read.Geometry, fc, definition, read.CancellationToken);
                }
                finally { spatialQueryMs = queryTimer.Elapsed.TotalMilliseconds; }

                var hydrationTimer = Stopwatch.StartNew();
                IReadOnlyList<(string PackageId, string? ShortId, string AoiJson)> items;
                try {
                    var offset = ((long)read.Page - 1) * read.PageSize;
                    if (offset >= matches.Count) { items = []; }
                    else {
                        var pageItems = new List<(string PackageId, string? ShortId, string AoiJson)>(Math.Min(read.PageSize, matches.Count));
                        foreach (var package in matches.Skip((int)offset).Take(read.PageSize)) {
                            read.CancellationToken.ThrowIfCancellationRequested();
                            // Only the current AOI references that passed the spatial filter are hydrated.
                            pageItems.Add((package.Id!.Value, package.MetaData?.ShortId, this.ReadAoi(connector, package, read.CancellationToken)));
                        }
                        items = pageItems;
                    }
                    read.CancellationToken.ThrowIfCancellationRequested();
                }
                finally { packageHydrationMs = hydrationTimer.Elapsed.TotalMilliseconds; }
                results[index] = new(items, matches.Count, spatialQueryMs, packageHydrationMs, null);
            }
            catch (Exception exception) {
                // A missing AOI or a canceled caller must not invalidate another page in the batch.
                results[index] = new([], 0, spatialQueryMs, packageHydrationMs, exception);
            }
        }
        return results;
    }

    private IReadOnlyList<PackageState> FindWorkspacePackages(
        string pipelineId, Polygon workspace, FeatureClass featureClass, FeatureClassDefinition definition, CancellationToken cancellationToken) {
        // Filter the indexed AOI rows using the requested Workspace polygon, then retain
        // active Pipeline bindings and current AOI references exactly as in the single read.
        var matches = this.FindIntersectingAois(workspace, featureClass, definition, cancellationToken);
        var candidates = new List<PackageState>();
        foreach (var match in matches) {
            cancellationToken.ThrowIfCancellationRequested();
            if (this._assignments.Contains(match.Key, pipelineId)
                && this._packages.TryGetValue(match.Key, out var package) && package.GeometryRef is { } reference && match.Value.Contains(reference)) {
                candidates.Add(package);
            }
        }
        return candidates.OrderBy(package => package.Id!.Value, StringComparer.Ordinal).ToArray();
    }

    /// <summary>Tests only the package's current AOI reference; no detail geometry is loaded.</summary>
    internal bool AoiIntersectsWorkspace(string aoiReference, Polygon workspace, CancellationToken cancellationToken) =>
        this.AoiIntersectsWorkspaces(aoiReference, [workspace], cancellationToken)[0];

    /// <summary>Tests multiple workspaces with one geodatabase and feature class read scope.</summary>
    internal IReadOnlyList<bool> AoiIntersectsWorkspaces(string aoiReference, IReadOnlyList<Polygon> workspaces, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(workspaces);
        cancellationToken.ThrowIfCancellationRequested();
        if (workspaces.Count == 0) { return []; }

        var parts = aoiReference.Split("::", StringSplitOptions.None);
        if (parts.Length != 2 || !string.Equals(parts[0], "surface", StringComparison.OrdinalIgnoreCase) || !Guid.TryParse(parts[1], out var id)) {
            throw new InvalidOperationException("Invalid package AOI reference.");
        }
        using var connector = this.createGeodatabase();
        using var fc = connector.OpenDataset<FeatureClass>(this._featureClassDefinitions["surface"].GetName());
        using var definition = fc.GetDefinition();
        var spatialReference = definition.GetSpatialReference();
        if (spatialReference is null || spatialReference.IsUnknown) { throw new InvalidOperationException("Package AOI coverage requires a known spatial reference."); }
        var globalIdField = definition.GetGlobalIDField();
        var whereClause = $"{globalIdField} = '{id.ToString("B").ToUpperInvariant()}' AND code = '{nameof(S100FC.S840.FeatureTypes.PackageCoverage)}'";
        var intersections = new bool[workspaces.Count];
        for (var index = 0; index < workspaces.Count; index++) {
            cancellationToken.ThrowIfCancellationRequested();
            var workspace = workspaces[index];
            var geometry = workspace.SpatialReference.IsEqual(spatialReference) ? workspace : GeometryEngine.Instance.Project(workspace, spatialReference);
            var filter = new SpatialQueryFilter {
                FilterGeometry = geometry,
                SpatialRelationship = SpatialRelationship.Intersects,
                // Retain the current AOI reference check so replaced historical rows cannot match.
                WhereClause = whereClause,
                SubFields = globalIdField,
            };
            using var cursor = fc.Search(filter, false);
            intersections[index] = cursor.MoveNext();
            if (intersections[index]) { using var row = cursor.Current; }
            cancellationToken.ThrowIfCancellationRequested();
        }
        return intersections;
    }
}
