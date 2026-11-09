namespace S100FC.ProductCatalogue;

/// <summary>Provides an invocation-scoped archive reader on the existing ArcGIS execution lane.</summary>
public partial class ProductManagerGDB
{
    /// <inheritdoc/>
    public IArchiveChangeScan OpenArchiveScan(DateTime sinceUtc, DateTime throughUtc, IReadOnlyCollection<DateTime> comparisonBoundsUtc) =>
        new ReusableArchiveScan(this, new ArchiveScanWindow(sinceUtc, throughUtc), comparisonBoundsUtc.Append(sinceUtc).Distinct().ToArray());

    /// <inheritdoc/>
    public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> ReadPendingEditsAsync(DateTime sinceUtc, DateTime throughUtc, CancellationToken cancellationToken) =>
        ReadPendingEditsCoreAsync(sinceUtc, throughUtc, null, cancellationToken);

    /// <summary>Retains only managed snapshots; all loading and geometry comparisons stay on the ArcGIS execution lane.</summary>
    private sealed class ReusableArchiveScan(ProductManagerGDB manager, ArchiveScanWindow bounds, IReadOnlyCollection<DateTime> comparisonBoundsUtc) : IArchiveChangeScan
    {
        private List<ArchiveHistory>? _histories;
        private bool _disposed;

        /// <inheritdoc/>
        public async Task<Dictionary<string, ArchiveRow>> ReadAsync(DateTime sinceUtc, string sourceName, CancellationToken cancellationToken) {
            ObjectDisposedException.ThrowIf(_disposed, this);
            cancellationToken.ThrowIfCancellationRequested();
            var window = new ArchiveScanWindow(sinceUtc, bounds.ThroughUtc);
            if (sinceUtc < bounds.SinceUtc)
                throw new ArgumentOutOfRangeException(nameof(sinceUtc), "The requested archive boundary precedes the retained history.");
            if (!comparisonBoundsUtc.Contains(sinceUtc))
                throw new ArgumentOutOfRangeException(nameof(sinceUtc), "The comparison boundary was not included when retaining incoming owners.");
            // Preserve the original rejection of ambiguous offset-free SQL boundaries.
            DpcArchiveClock.Value.ToQueryLowerBound(window);
            if (_histories is null) {
                var loaded = new List<ArchiveHistory>();
                Logger.Information("DPC reusable archive history read started. SinceUtc: {SinceUtc:O}. ThroughUtc: {ThroughUtc:O}.", bounds.SinceUtc, bounds.ThroughUtc);
                await manager.ReadPendingEditsCoreAsync(bounds.SinceUtc, bounds.ThroughUtc, loaded, cancellationToken, comparisonBoundsUtc);
                cancellationToken.ThrowIfCancellationRequested();
                _histories = loaded;
                Logger.Information("DPC reusable archive history read completed. ConnectionCount: {ConnectionCount}. FeatureCount: {FeatureCount}.", loaded.Count, loaded.Sum(history => history.Versions.Count));
            }
            return await manager.Dispatch(() => {
                var result = new Dictionary<string, ArchiveRow>(StringComparer.OrdinalIgnoreCase);
                foreach (var history in _histories) {
                    cancellationToken.ThrowIfCancellationRequested();
                    foreach (var (id, row) in history.Compose(window, sourceName, cancellationToken))
                        result[id] = row;
                }
                return result;
            });
        }

        /// <inheritdoc/>
        public ValueTask DisposeAsync() {
            _disposed = true;
            _histories = null;
            return ValueTask.CompletedTask;
        }
    }

    /// <summary>Retains an incoming spatial owner's parsed references and its existing coverage/AOI match once.</summary>
    /// <param name="Interval">The owner's archived lifetime, including intermediate versions needed by later boundaries.</param>
    /// <param name="Targets">Changed non-spatial targets referenced by this version.</param>
    /// <param name="Products">Products selected by the unchanged scale, DataCoverage and AOI matcher.</param>
    internal sealed record ArchiveOwner(ArchiveInterval Interval, IReadOnlyCollection<ArchiveBindingTarget> Targets, IReadOnlyList<string> Products);

    /// <summary>Indexes immutable source versions by product without caching a full all-product diff for every timestamp.</summary>
    internal sealed class ArchiveHistory(ArchiveScanWindow bounds, IReadOnlyCollection<DateTime>? comparisonBoundsUtc = null)
    {
        private readonly Dictionary<string, HashSet<string>> _idsByProduct = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, Dictionary<string, List<ArchiveOwner>>> _ownersByProduct = new(StringComparer.OrdinalIgnoreCase);
        private HashSet<string> _associatedIds = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>Exact endpoints requiring incoming owner versions; null preserves the general history-test contract.</summary>
        internal IReadOnlyCollection<DateTime>? ComparisonBoundsUtc { get; } = comparisonBoundsUtc?.Append(bounds.ThroughUtc).Distinct().ToArray();

        /// <summary>Source versions read once from this connection; native rows and cursors have already been disposed.</summary>
        internal Dictionary<string, List<ArchiveVersion>> Versions { get; private set; } = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>Incoming owner versions collected before sealing the history.</summary>
        internal List<ArchiveOwner> Owners { get; } = [];

        /// <summary>Builds product indexes once after all archive tables and incoming references have been validated.</summary>
        /// <param name="versions">All observed spatial and associated versions within the retained window.</param>
        /// <param name="associatedTargets">Non-spatial targets whose membership comes from incoming spatial owners.</param>
        internal void Seal(Dictionary<string, List<ArchiveVersion>> versions, IEnumerable<ArchiveBindingTarget> associatedTargets) {
            Versions = versions;
            _associatedIds = associatedTargets.Select(target => target.SourceId).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var (id, rows) in versions)
                foreach (var product in rows.SelectMany(row => row.Products ?? []).Distinct(StringComparer.OrdinalIgnoreCase))
                    AddId(product, id);
            foreach (var owner in Owners) {
                foreach (var product in owner.Products) {
                    if (!_ownersByProduct.TryGetValue(product, out var owners))
                        _ownersByProduct[product] = owners = new(StringComparer.OrdinalIgnoreCase);
                    foreach (var target in owner.Targets) {
                        AddId(product, target.SourceId);
                        if (!owners.TryGetValue(target.SourceId, out var references)) owners[target.SourceId] = references = [];
                        references.Add(owner);
                    }
                }
            }
        }

        /// <summary>Indexes a candidate source identity; exact window membership is deliberately deferred until composition.</summary>
        private void AddId(string product, string id) {
            if (!_idsByProduct.TryGetValue(product, out var ids)) _idsByProduct[product] = ids = new(StringComparer.OrdinalIgnoreCase);
            ids.Add(id);
        }

        /// <summary>Reuses raw versions, never an earlier net diff, so reverts, deletions and scale/binding changes retain exact endpoint semantics.</summary>
        /// <param name="window">The source's exact exclusive lower bound and the retained inclusive cutoff.</param>
        /// <param name="sourceName">The product to compose independently of other package histories.</param>
        /// <param name="cancellationToken">Cancels between source features without consuming a checkpoint.</param>
        /// <returns>Independent change objects with membership at this exact cutoff.</returns>
        internal Dictionary<string, ArchiveRow> Compose(ArchiveScanWindow window, string sourceName, CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            if (window.SinceUtc < bounds.SinceUtc || window.ThroughUtc != bounds.ThroughUtc)
                throw new ArgumentOutOfRangeException(nameof(window), "The comparison must stay inside the retained archive window.");
            var result = new Dictionary<string, ArchiveRow>(StringComparer.OrdinalIgnoreCase);
            if (!_idsByProduct.TryGetValue(sourceName, out var ids)) return result;
            var owners = _ownersByProduct.GetValueOrDefault(sourceName);
            foreach (var id in ids) {
                cancellationToken.ThrowIfCancellationRequested();
                var versions = Versions[id];
                var observed = versions.Where(version => version.Interval.LatestEvent(window).HasValue).ToArray();
                if (observed.Length == 0) continue;
                bool affected;
                bool current;
                if (_associatedIds.Contains(id)) {
                    var referencing = owners?.GetValueOrDefault(id) ?? [];
                    affected = referencing.Any(owner => owner.Interval.Contains(window.SinceUtc) || owner.Interval.Contains(window.ThroughUtc));
                    current = referencing.Any(owner => owner.Interval.Contains(window.ThroughUtc));
                }
                else {
                    var matching = observed.Where(version => version.Products?.Contains(sourceName, StringComparer.OrdinalIgnoreCase) == true).ToArray();
                    affected = matching.Length > 0;
                    current = matching.Any(version => version.Interval.Contains(window.ThroughUtc));
                }
                if (!affected) continue;
                var change = ComposeArchiveChange(observed, window);
                change.CurrentInProduct = current;
                result[id] = change;
            }
            return result;
        }
    }
}
