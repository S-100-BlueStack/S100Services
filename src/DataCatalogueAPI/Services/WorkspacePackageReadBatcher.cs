using System.Diagnostics;
using DataCatalague.Api.Repositories;

namespace DataCatalague.Api.Services;

/// <summary>Coalesces Workspace geometry and package reads on the existing ArcGIS thread.</summary>
public sealed class WorkspacePackageReadBatcher(
    ArcGisDispatcher dispatcher, DispatchRepository coverage, PackageRepository packages) : IDisposable
{
    // Both read types use the same bounded window so Workspace details do not open
    // a second coverage scope while package membership reads are being collected.
    private const int MaximumBatchSize = 4;
    private static readonly TimeSpan CollectionWindow = TimeSpan.FromMilliseconds(6);

    private readonly object _gate = new();
    private List<PendingRead> _pending = [];
    private long _generation;
    private bool _disposed;

    internal sealed record ReadResult(
        IReadOnlyList<(string PackageId, string? ShortId, string AoiJson)> Items,
        int TotalCount,
        int BatchSize,
        double BatchWaitMs,
        double ArcGisQueueWaitMs,
        double WorkspaceScopeMs,
        double WorkspaceGeometryMs,
        double PackageScopeMs,
        double SpatialQueryMs,
        double PackageHydrationMs);

    internal sealed record GeometryResult(
        string EsriJson,
        int BatchSize,
        double BatchWaitMs,
        double ArcGisQueueWaitMs,
        double WorkspaceScopeMs,
        double WorkspaceGeometryMs,
        double SerializationMs);

    private sealed class PendingRead(
        string geometryReference, CancellationToken cancellationToken,
        string? pipelineId = null, int page = 0, int pageSize = 0)
    {
        internal string GeometryReference { get; } = geometryReference;
        internal CancellationToken CancellationToken { get; } = cancellationToken;
        internal string? PipelineId { get; } = pipelineId;
        internal int Page { get; } = page;
        internal int PageSize { get; } = pageSize;
        internal bool IsGeometryOnly => this.PipelineId is null;
        internal long EnqueuedAt { get; } = Stopwatch.GetTimestamp();
        internal TaskCompletionSource<BatchOutcome> Completion { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    internal sealed record BatchOutcome(ReadResult? Page, GeometryResult? Geometry, Exception? Error);

    internal async Task<ReadResult> ReadAsync(
        string pipelineId, string geometryReference, int page, int pageSize, CancellationToken cancellationToken) {
        var outcome = await this.EnqueueAsync(new PendingRead(geometryReference, cancellationToken, pipelineId, page, pageSize)).ConfigureAwait(false);
        return outcome.Page!;
    }

    internal async Task<GeometryResult> ReadGeometryAsync(string geometryReference, CancellationToken cancellationToken) {
        var outcome = await this.EnqueueAsync(new PendingRead(geometryReference, cancellationToken)).ConfigureAwait(false);
        return outcome.Geometry!;
    }

    private async Task<BatchOutcome> EnqueueAsync(PendingRead read) {
        read.CancellationToken.ThrowIfCancellationRequested();
        using var registration = read.CancellationToken.Register(() => read.Completion.TrySetCanceled(read.CancellationToken));
        List<PendingRead>? fullBatch = null;
        long? generationToSchedule = null;
        lock (this._gate) {
            ObjectDisposedException.ThrowIf(this._disposed, this);
            this._pending.Add(read);
            if (this._pending.Count == 1) { generationToSchedule = ++this._generation; }
            if (this._pending.Count == MaximumBatchSize) {
                fullBatch = this._pending;
                this._pending = [];
                ++this._generation;
            }
        }
        if (generationToSchedule is { } generation) { _ = this.FlushAfterWindowAsync(generation); }
        if (fullBatch is not null) { _ = this.ProcessBatchAsync(fullBatch); }
        return await read.Completion.Task.ConfigureAwait(false);
    }

    private async Task FlushAfterWindowAsync(long generation) {
        await Task.Delay(CollectionWindow).ConfigureAwait(false);
        List<PendingRead>? batch = null;
        lock (this._gate) {
            // A full batch may have flushed already; never flush a newer generation.
            if (!this._disposed && generation == this._generation && this._pending.Count > 0) {
                batch = this._pending;
                this._pending = [];
                ++this._generation;
            }
        }
        if (batch is not null) { await this.ProcessBatchAsync(batch).ConfigureAwait(false); }
    }

    private async Task ProcessBatchAsync(IReadOnlyList<PendingRead> batch) {
        var active = batch.Where(read => !read.CancellationToken.IsCancellationRequested).ToArray();
        if (active.Length == 0) { return; }
        var dispatchedAt = Stopwatch.GetTimestamp();
        var queueWaitMs = 0.0;
        try {
            var outcomes = await dispatcher.ExecuteAsync(() => {
                queueWaitMs = Stopwatch.GetElapsedTime(dispatchedAt).TotalMilliseconds;
                return this.ReadOnArcGisThread(active, queueWaitMs, dispatchedAt);
            }).ConfigureAwait(false);
            for (var index = 0; index < active.Length; index++) {
                var read = active[index];
                if (read.CancellationToken.IsCancellationRequested) {
                    read.Completion.TrySetCanceled(read.CancellationToken);
                }
                else if (outcomes[index].Error is { } exception) { read.Completion.TrySetException(exception); }
                else { read.Completion.TrySetResult(outcomes[index]); }
            }
        }
        catch (Exception exception) {
            // A failed coverage scope affects every reader; failures opening only the
            // package scope are isolated inside ReadOnArcGisThread.
            foreach (var read in active) {
                if (read.CancellationToken.IsCancellationRequested) { read.Completion.TrySetCanceled(read.CancellationToken); }
                else { read.Completion.TrySetException(exception); }
            }
        }
    }

    private IReadOnlyList<BatchOutcome> ReadOnArcGisThread(
        IReadOnlyList<PendingRead> reads, double queueWaitMs, long dispatchedAt) {
        // Reuse a polygon when a details request and membership request for the
        // same Workspace reach the same batch. Never expose ArcGIS objects outside STA.
        var referenceIndices = new Dictionary<string, int>(StringComparer.Ordinal);
        var referenceCounts = reads.GroupBy(read => read.GeometryReference, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var geometryReads = new List<WorkspaceGeometryRead>();
        var geometryIndices = new int[reads.Count];
        for (var index = 0; index < reads.Count; index++) {
            var read = reads[index];
            if (!referenceIndices.TryGetValue(read.GeometryReference, out var geometryIndex)) {
                geometryIndex = geometryReads.Count;
                referenceIndices.Add(read.GeometryReference, geometryIndex);
                // One canceled consumer must not abort geometry needed by another.
                // Shared reads still validate each caller's cancellation separately.
                var token = referenceCounts[read.GeometryReference] > 1
                    ? CancellationToken.None : read.CancellationToken;
                geometryReads.Add(new(read.GeometryReference, token));
            }
            geometryIndices[index] = geometryIndex;
        }

        var geometryResults = coverage.ReadWorkspaceGeometryBatch(geometryReads, out var workspaceScopeMs);
        var queries = new List<WorkspacePackagePageQuery>();
        var queryIndices = new int[reads.Count];
        Array.Fill(queryIndices, -1);
        for (var index = 0; index < reads.Count; index++) {
            var read = reads[index];
            var geometryResult = geometryResults[geometryIndices[index]];
            if (read.CancellationToken.IsCancellationRequested || read.IsGeometryOnly
                || geometryResult.Geometry is null || geometryResult.Error is not null) { continue; }
            queryIndices[index] = queries.Count;
            queries.Add(new(read.PipelineId!, geometryResult.Geometry, read.Page, read.PageSize, read.CancellationToken));
        }

        IReadOnlyList<WorkspacePackagePageReadResult> packageResults = [];
        var packageScopeMs = 0.0;
        Exception? packageScopeError = null;
        if (queries.Count > 0) {
            try { packageResults = packages.ReadWorkspacePackagePages(queries, out packageScopeMs); }
            catch (Exception exception) { packageScopeError = exception; }
        }

        var results = new BatchOutcome[reads.Count];
        for (var index = 0; index < reads.Count; index++) {
            var read = reads[index];
            var geometryResult = geometryResults[geometryIndices[index]];
            if (read.CancellationToken.IsCancellationRequested) {
                results[index] = new(null, null, new OperationCanceledException(read.CancellationToken));
            }
            else if (geometryResult.Error is { } geometryError) {
                results[index] = new(null, null, geometryError);
            }
            else if (read.IsGeometryOnly) {
                var serialization = Stopwatch.StartNew();
                try {
                    var json = geometryResult.Geometry!.ToJson();
                    results[index] = new(null, new GeometryResult(
                        json, reads.Count,
                        Stopwatch.GetElapsedTime(read.EnqueuedAt, dispatchedAt).TotalMilliseconds,
                        queueWaitMs, workspaceScopeMs, geometryResult.ReadMs, serialization.Elapsed.TotalMilliseconds), null);
                }
                catch (Exception exception) { results[index] = new(null, null, exception); }
            }
            else if (packageScopeError is not null) {
                results[index] = new(null, null, packageScopeError);
            }
            else {
                var queryIndex = queryIndices[index];
                if (queryIndex < 0) {
                    // A request canceled after admission cannot publish a successful page.
                    results[index] = new(null, null, new OperationCanceledException(read.CancellationToken));
                    continue;
                }
                var pageResult = packageResults[queryIndex];
                results[index] = pageResult.Error is { } pageError
                    ? new(null, null, pageError)
                    : new(new ReadResult(
                        pageResult.Items, pageResult.TotalCount, reads.Count,
                        Stopwatch.GetElapsedTime(read.EnqueuedAt, dispatchedAt).TotalMilliseconds,
                        queueWaitMs, workspaceScopeMs, geometryResult.ReadMs, packageScopeMs,
                        pageResult.SpatialQueryMs, pageResult.PackageHydrationMs), null, null);
            }
        }
        return results;
    }

    public void Dispose() {
        List<PendingRead> pending;
        lock (this._gate) {
            if (this._disposed) { return; }
            this._disposed = true;
            ++this._generation;
            pending = this._pending;
            this._pending = [];
        }
        foreach (var read in pending) { read.Completion.TrySetException(new ObjectDisposedException(nameof(WorkspacePackageReadBatcher))); }
    }
}
