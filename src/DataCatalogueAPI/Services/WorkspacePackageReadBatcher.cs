using System.Diagnostics;
using DataCatalague.Api.Repositories;

namespace DataCatalague.Api.Services;

/// <summary>Coalesces a bounded burst of independent Workspace reads on the single ArcGIS thread.</summary>
public sealed class WorkspacePackageReadBatcher(
    ArcGisDispatcher dispatcher, DispatchRepository coverage, PackageRepository packages) : IDisposable
{
    // Match the current map's four read workers without delaying an isolated request noticeably.
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

    private sealed class PendingRead(string pipelineId, string geometryReference, int page, int pageSize, CancellationToken cancellationToken)
    {
        internal string PipelineId { get; } = pipelineId;
        internal string GeometryReference { get; } = geometryReference;
        internal int Page { get; } = page;
        internal int PageSize { get; } = pageSize;
        internal CancellationToken CancellationToken { get; } = cancellationToken;
        internal long EnqueuedAt { get; } = Stopwatch.GetTimestamp();
        internal TaskCompletionSource<ReadResult> Completion { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    private sealed record BatchOutcome(ReadResult? Value, Exception? Error);

    internal async Task<ReadResult> ReadAsync(
        string pipelineId, string geometryReference, int page, int pageSize, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var read = new PendingRead(pipelineId, geometryReference, page, pageSize, cancellationToken);
        using var registration = cancellationToken.Register(() => read.Completion.TrySetCanceled(cancellationToken));
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
                else { read.Completion.TrySetResult(outcomes[index].Value!); }
            }
        }
        catch (Exception exception) {
            // Dispatcher initialization/read-scope failures fail the batch; individual
            // geometry and page failures are isolated in ReadOnArcGisThread.
            foreach (var read in active) {
                if (read.CancellationToken.IsCancellationRequested) { read.Completion.TrySetCanceled(read.CancellationToken); }
                else { read.Completion.TrySetException(exception); }
            }
        }
    }

    private IReadOnlyList<BatchOutcome> ReadOnArcGisThread(
        IReadOnlyList<PendingRead> reads, double queueWaitMs, long dispatchedAt) {
        var geometryResults = coverage.ReadWorkspaceGeometryBatch(
            reads.Select(read => new WorkspaceGeometryRead(read.GeometryReference, read.CancellationToken)).ToArray(),
            out var workspaceScopeMs);

        var queries = new List<WorkspacePackagePageQuery>();
        for (var index = 0; index < reads.Count; index++) {
            if (geometryResults[index].Geometry is { } geometry && geometryResults[index].Error is null) {
                queries.Add(new(reads[index].PipelineId, geometry, reads[index].Page, reads[index].PageSize, reads[index].CancellationToken));
            }
        }

        IReadOnlyList<WorkspacePackagePageReadResult> packageResults = [];
        // Keep the connection setup time visible without charging it to every page query.
        var packageScopeMs = 0.0;
        if (queries.Count > 0) {
            packageResults = packages.ReadWorkspacePackagePages(queries, out packageScopeMs);
        }

        var results = new BatchOutcome[reads.Count];
        var queryIndex = 0;
        for (var index = 0; index < reads.Count; index++) {
            var geometryResult = geometryResults[index];
            if (geometryResult.Error is { } geometryError) {
                results[index] = new(null, geometryError);
                continue;
            }
            var pageResult = packageResults[queryIndex++];
            results[index] = pageResult.Error is { } pageError
                ? new(null, pageError)
                : new(new ReadResult(
                    pageResult.Items, pageResult.TotalCount, reads.Count,
                    Stopwatch.GetElapsedTime(reads[index].EnqueuedAt, dispatchedAt).TotalMilliseconds,
                    queueWaitMs, workspaceScopeMs, geometryResult.ReadMs, packageScopeMs,
                    pageResult.SpatialQueryMs, pageResult.PackageHydrationMs), null);
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
