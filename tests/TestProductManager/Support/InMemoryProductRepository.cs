using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogueAPI.Support;

/// <summary>Stores product state in memory for tests that exercise workflows without SQL Server.</summary>
internal sealed class InMemoryProductRepository : IProductRepository, IProductWorkflowRepository
{
    private readonly object _gate = new();
    private readonly List<ProductRecord> _products = [];
    private readonly Dictionary<string, DateTime> _lastSuccessfulRuns = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<(string Name, ProductSpecification Specification), ProductExportTrackRecord> _tracks = new();
    private readonly List<(Guid Id, ProductRevisionWrite Revision)> _revisions = [];
    private readonly List<(Guid Id, ProductArtifactWrite Artifact)> _artifacts = [];

    /// <inheritdoc/>
    public Task AppendAsync(string name, ProductState state, string productSpecification, uint editionNo, uint? updateNo, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null, string? errorCode = null, string? errorMessage = null) {
        lock (_gate) {
            var now = DateTime.UtcNow;
            var normalizedSpecification = NormalizeProductSpecification(productSpecification);
            if (state == ProductState.Rejected) {
                errorCode ??= "IC_ENC_REJECTED";
                errorMessage ??= "IC-ENC rejected the dataset. Download the available report for details.";
            }
            foreach (var product in _products.Where(product => product.Name == name && NormalizeProductSpecification(product.ProductSpecification) == normalizedSpecification && product.Date_to == MaxDate))
                product.Date_to = now;
            _products.Add(new ProductRecord { Id = Guid.NewGuid(), Name = name, State = state, ProductSpecification = productSpecification, EditionNo = checked((int)editionNo), UpdateNo = checked((int)(updateNo ?? 0)), Owner = owner, Date_From = now, Date_to = MaxDate, ErrorCode = errorCode, ErrorMessage = errorMessage });
        }
        return Task.CompletedTask;
    }

    /// <inheritdoc/>
    public Task<IEnumerable<ProductRecord>> GetCurrentAsync() { lock (_gate) return Task.FromResult(_products.Where(product => product.Date_to == MaxDate).GroupBy(product => product.Name).Select(SelectPreferredCurrent).AsEnumerable()); }

    /// <inheritdoc/>
    public Task<ProductRecord?> GetCurrentByNameAsync(string name) { lock (_gate) return Task.FromResult(_products.Where(product => product.Name == name && product.Date_to == MaxDate).OrderBy(product => NormalizeProductSpecification(product.ProductSpecification) == "S101" ? 0 : 1).ThenByDescending(product => product.Date_From).FirstOrDefault()); }

    /// <inheritdoc/>
    public Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names) { var requested = names.ToHashSet(StringComparer.OrdinalIgnoreCase); lock (_gate) return Task.FromResult(_products.Where(product => requested.Contains(product.Name) && product.Date_to == MaxDate).GroupBy(product => product.Name).Select(SelectPreferredCurrent).AsEnumerable()); }

    /// <inheritdoc/>
    public Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names, ProductSpecification productSpecification) { var requested = names.ToHashSet(StringComparer.OrdinalIgnoreCase); var specification = productSpecification.ToString(); lock (_gate) return Task.FromResult(_products.Where(product => requested.Contains(product.Name) && product.Date_to == MaxDate && NormalizeProductSpecification(product.ProductSpecification) == specification).GroupBy(product => product.Name).Select(group => group.OrderByDescending(product => product.Date_From).First()).AsEnumerable()); }

    /// <inheritdoc/>
    public Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName) { lock (_gate) return Task.FromResult(_lastSuccessfulRuns.TryGetValue(jobName, out var value) ? value : (DateTime?)null); }

    /// <inheritdoc/>
    public Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime) { lock (_gate) _lastSuccessfulRuns[jobName] = dateTime; return Task.CompletedTask; }

    /// <inheritdoc/>
    public async Task<string[]> GetIneligbleProductsAsync() => [.. (await GetCurrentAsync()).Where(product => product.State is ProductState.Frozen or ProductState.InTransit or ProductState.Exporting or ProductState.Validating).Select(product => product.Name)];

    /// <inheritdoc/>
    public async Task<string[]> GetEligibleProductsAsync() => [.. (await GetCurrentAsync()).Where(product => product.State is not (ProductState.Frozen or ProductState.InTransit or ProductState.Exporting or ProductState.Validating)).Select(product => product.Name)];

    /// <inheritdoc/>
    public Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name) { lock (_gate) return Task.FromResult(_products.Where(product => product.Name == name).OrderByDescending(product => product.Date_From).AsEnumerable()); }

    /// <inheritdoc/>
    public Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive) { lock (_gate) return Task.FromResult(_products.Where(product => product.Date_From >= fromInclusive && product.Date_From < toExclusive).OrderByDescending(product => product.Date_From).AsEnumerable()); }

    /// <inheritdoc/>
    public Task<ProductExportTrackRecord?> GetTrackAsync(string datasetName, ProductSpecification productSpecification, CancellationToken cancellationToken = default) { lock (_gate) return Task.FromResult(_tracks.GetValueOrDefault((datasetName, productSpecification))); }

    /// <inheritdoc/>
    public Task<IReadOnlyList<ProductExportTrackRecord>> GetTracksAsync(string datasetName, CancellationToken cancellationToken = default) { lock (_gate) return Task.FromResult<IReadOnlyList<ProductExportTrackRecord>>([.. _tracks.Values.Where(track => string.Equals(track.DatasetName, datasetName, StringComparison.OrdinalIgnoreCase))]); }

    /// <inheritdoc/>
    public Task<IReadOnlyList<ProductExportTrackRecord>> GetTracksByNamesAsync(IEnumerable<string> datasetNames, CancellationToken cancellationToken = default) { var names = datasetNames.ToHashSet(StringComparer.OrdinalIgnoreCase); lock (_gate) return Task.FromResult<IReadOnlyList<ProductExportTrackRecord>>([.. _tracks.Values.Where(track => names.Contains(track.DatasetName))]); }

    /// <inheritdoc/>
    public Task<ProductExportTrackRecord> GetOrCreateTrackAsync(string datasetName, ProductSpecification productSpecification, ExportEngineKind engine, int publishedEdition, int publishedUpdate, CancellationToken cancellationToken = default) {
        lock (_gate) {
            if (!_tracks.TryGetValue((datasetName, productSpecification), out var track)) {
                track = new ProductExportTrackRecord { Id = Guid.NewGuid(), DatasetName = datasetName, ProductSpecification = productSpecification, Engine = engine, State = ProductState.Idle, PublishedEdition = publishedEdition, PublishedUpdate = publishedUpdate, UpdatedAtUtc = DateTime.UtcNow };
                _tracks.Add((datasetName, productSpecification), track);
            }
            return Task.FromResult(track);
        }
    }

    /// <inheritdoc/>
    public Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        lock (_gate) {
            var track = FindTrack(trackId);
            if (track.IsManuallyFrozen || track.State is ProductState.Frozen or ProductState.InTransit or
                ProductState.Exporting or ProductState.Validating or ProductState.ReadyForDistribution or
                ProductState.AcceptedForDistribution or ProductState.Rejected)
                throw new InvalidOperationException("The export track is not eligible for another candidate.");
            track.CandidatePreviousState = ProductCandidateRecovery.PreviousStateForReplacement(track.State, track.CandidatePreviousState);
            track.State = ProductState.Exporting;
            track.CandidateEdition = candidateEdition;
            track.CandidateUpdate = candidateUpdate;
            track.UpdatedAtUtc = occurredAtUtc;
        }
        return Task.CompletedTask;
    }

    /// <inheritdoc/>
    public Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default) { lock (_gate) { var track = FindTrack(trackId); track.State = state; track.UpdatedAtUtc = occurredAtUtc; track.ErrorCode = errorCode; track.ErrorMessage = errorMessage; } return Task.CompletedTask; }

    /// <inheritdoc/>
    public Task<bool> TryFailInterruptedPackageExportAsync(Guid expectedPackageId, Guid expectedTrackId,
        string datasetName, ProductSpecification specification, ProductState expectedState,
        DateTime expectedUpdatedAtUtc, int candidateEdition, int candidateUpdate,
        DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) {
            if (expectedPackageId == Guid.Empty || expectedTrackId == Guid.Empty ||
                specification is not (ProductSpecification.S101 or ProductSpecification.S57) ||
                expectedState is not (ProductState.Exporting or ProductState.Validating) || occurredAtUtc.Kind != DateTimeKind.Utc)
                throw new ArgumentException("Interrupted export recovery requires an exact package and in-progress track.");
            var track = _tracks.Values.FirstOrDefault(current => current.Id == expectedTrackId);
            if (track is null || !string.Equals(track.DatasetName, datasetName, StringComparison.OrdinalIgnoreCase) ||
                track.ProductSpecification != specification || track.State != expectedState ||
                track.UpdatedAtUtc != expectedUpdatedAtUtc || track.CandidateEdition != candidateEdition ||
                track.CandidateUpdate != candidateUpdate || track.IsManuallyFrozen)
                return Task.FromResult(false);
            // In-memory track storage has no ENC package table. The caller checks
            // the package identity; SQL enforces that guard in the same transaction.
            track.State = ProductState.Error;
            track.UpdatedAtUtc = occurredAtUtc;
            track.ErrorCode = "ENC_EXPORT_INTERRUPTED";
            track.ErrorMessage = "The candidate build was interrupted. Discard it before another package is created.";
            return Task.FromResult(true);
        }
    }

    /// <inheritdoc/>
    public Task<Guid> CompleteExportWithHistoryAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) {
            var track = FindTrack(trackId);
            if (track.State != ProductState.Validating || track.CandidateEdition is null || track.CandidateUpdate is null)
                throw new InvalidOperationException("The export completion state is not eligible.");
            var historyId = Guid.NewGuid();
            track.State = ProductState.ReadyForDistribution;
            track.UpdatedAtUtc = occurredAtUtc;
            foreach (var current in _products.Where(row => row.Name == track.DatasetName &&
                NormalizeProductSpecification(row.ProductSpecification) == track.ProductSpecification.ToString() && row.Date_to == MaxDate))
                current.Date_to = occurredAtUtc;
            _products.Add(new ProductRecord { Id = historyId, Name = track.DatasetName,
                ProductSpecification = track.ProductSpecification.ToString(), State = track.State,
                EditionNo = track.CandidateEdition.Value, UpdateNo = track.CandidateUpdate.Value,
                Owner = owner, Date_From = occurredAtUtc, Date_to = MaxDate });
            return Task.FromResult(historyId);
        }
    }

    /// <inheritdoc/>
    public Task<bool> SetManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        lock (_gate) {
            var track = FindTrack(trackId);
            if (track.IsManuallyFrozen)
                return Task.FromResult(false);

            track.IsManuallyFrozen = true;
            track.UpdatedAtUtc = occurredAtUtc;
            return Task.FromResult(true);
        }
    }

    /// <inheritdoc/>
    public Task<bool> ClearManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        lock (_gate) {
            var track = FindTrack(trackId);
            if (!track.IsManuallyFrozen)
                return Task.FromResult(false);

            track.IsManuallyFrozen = false;
            track.UpdatedAtUtc = occurredAtUtc;
            return Task.FromResult(true);
        }
    }

    /// <inheritdoc/>
    public Task DiscardCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        lock (_gate) {
            var track = FindTrack(trackId);
            if (track.IsManuallyFrozen || !ProductCandidateRecovery.CanDiscard(track.State, track.CandidatePreviousState, track.CandidateEdition, track.CandidateUpdate))
                throw new InvalidOperationException("The product track has no eligible unsent candidate to discard.");
            track.State = ProductCandidateRecovery.RestoredState(track.CandidatePreviousState);
            track.CandidateEdition = null;
            track.CandidateUpdate = null;
            track.CandidatePreviousState = null;
            track.UpdatedAtUtc = occurredAtUtc;
        }
        return Task.CompletedTask;
    }

    /// <inheritdoc/>
    public Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default) {
        var revisionId = Guid.NewGuid();
        lock (_gate)
            _revisions.Add((revisionId, revision));
        return Task.FromResult(revisionId);
    }

    /// <inheritdoc/>
    public Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default) { lock (_gate) _artifacts.Add((Guid.NewGuid(), artifact)); return Task.CompletedTask; }

    /// <inheritdoc/>
    public Task<Guid?> GetLatestRevisionIdAsync(Guid trackId, CancellationToken cancellationToken = default) {
        lock (_gate) {
            var latestRevisionId = _revisions
                .Where(item => item.Revision.TrackId == trackId)
                .OrderByDescending(item => item.Revision.CreatedAtUtc)
                .ThenByDescending(item => item.Id)
                .Select(item => (Guid?)item.Id)
                .FirstOrDefault();
            return Task.FromResult(latestRevisionId);
        }
    }

    /// <inheritdoc/>
    public Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactsAsync(Guid productRevisionId, CancellationToken cancellationToken = default) {
        lock (_gate) {
            return Task.FromResult<IReadOnlyList<ProductArtifactReference>>([.. _artifacts
                .Where(item => item.Artifact.RevisionId == productRevisionId && IsValidationArtifact(item.Artifact.Kind))
                .OrderByDescending(item => item.Artifact.CreatedAtUtc)
                .Select(item => new ProductArtifactReference(item.Id, item.Artifact.TrackId, item.Artifact.Kind, item.Artifact.FileName, item.Artifact.MediaType, item.Artifact.CreatedAtUtc, item.Artifact.RevisionId))]);
        }
    }

    /// <inheritdoc/>
    public Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactHistoryAsync(Guid trackId, CancellationToken cancellationToken = default) {
        lock (_gate) {
            return Task.FromResult<IReadOnlyList<ProductArtifactReference>>([.. _artifacts
                .Where(item => item.Artifact.TrackId == trackId && IsValidationArtifact(item.Artifact.Kind))
                .OrderByDescending(item => item.Artifact.CreatedAtUtc)
                .Select(item => new ProductArtifactReference(item.Id, item.Artifact.TrackId, item.Artifact.Kind, item.Artifact.FileName, item.Artifact.MediaType, item.Artifact.CreatedAtUtc, item.Artifact.RevisionId))]);
        }
    }

    /// <inheritdoc/>
    public Task<ProductArtifactContent?> GetValidationArtifactAsync(string datasetName, Guid artifactId, CancellationToken cancellationToken = default) {
        lock (_gate) {
            var item = _artifacts.SingleOrDefault(item => item.Id == artifactId);
            if (item.Id == Guid.Empty || item.Artifact is null || !IsValidationArtifact(item.Artifact.Kind))
                return Task.FromResult<ProductArtifactContent?>(null);
            var track = _tracks.Values.SingleOrDefault(track => track.Id == item.Artifact.TrackId);
            if (track is null || !string.Equals(track.DatasetName, datasetName, StringComparison.OrdinalIgnoreCase))
                return Task.FromResult<ProductArtifactContent?>(null);
            return Task.FromResult<ProductArtifactContent?>(new ProductArtifactContent(item.Id, item.Artifact.FileName, item.Artifact.MediaType, item.Artifact.Content));
        }
    }

    private ProductExportTrackRecord FindTrack(Guid trackId) => _tracks.Values.Single(track => track.Id == trackId);
    private static ProductRecord SelectPreferredCurrent(IGrouping<string, ProductRecord> group) => group.OrderBy(product => NormalizeProductSpecification(product.ProductSpecification) == "S101" ? 0 : 1).ThenByDescending(product => product.Date_From).First();
    private static bool IsValidationArtifact(ProductArtifactKind kind) => kind is ProductArtifactKind.ValidationReport or ProductArtifactKind.ValidationDiagnostic or ProductArtifactKind.IcEncReport;
    private static string NormalizeProductSpecification(string value) {
        var normalized = value.Replace("-", string.Empty, StringComparison.Ordinal).ToUpperInvariant();
        return normalized == "S128" ? "S101" : normalized;
    }
    private static readonly DateTime MaxDate = new(9999, 12, 31);
}
