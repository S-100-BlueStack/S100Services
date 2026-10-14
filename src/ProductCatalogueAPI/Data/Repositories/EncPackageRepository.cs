using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using System.Data;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Stores active ENC source snapshots independently of S-128 catalogue data.</summary>
public sealed class EncPackageRepository(DbConnectionFactory connectionFactory) : IEncPackageRepository
{
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;

    /// <inheritdoc/>
    public async Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames, CancellationToken cancellationToken = default, bool includeSourceYaml = true) {
        var names = sourceDatasetNames.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (names.Length == 0)
            return new Dictionary<string, EncPackage>(StringComparer.OrdinalIgnoreCase);

        using var connection = _connectionFactory.Create();
        var result = new Dictionary<string, EncPackage>(StringComparer.OrdinalIgnoreCase);
        foreach (var batch in names.Chunk(1000)) {
            var projection = includeSourceYaml ? SelectSql : SelectHeaderSql;
            var rows = await connection.QueryAsync<EncPackage>(new CommandDefinition($"{projection} WHERE source_dataset_name IN @Names", new { Names = batch }, cancellationToken: cancellationToken));
            foreach (var row in rows) {
                row.ScanFromUtc = DateTime.SpecifyKind(row.ScanFromUtc, DateTimeKind.Utc);
                row.DetectedAtUtc = DateTime.SpecifyKind(row.DetectedAtUtc, DateTimeKind.Utc);
                result.Add(row.SourceDatasetName, row);
            }
        }
        return result;
    }

    /// <inheritdoc/>
    public async Task<EncPackage?> GetByIdAsync(Guid packageId, CancellationToken cancellationToken = default) {
        if (packageId == Guid.Empty) return null;
        using var connection = _connectionFactory.Create();
        return await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition(
            $"{SelectHeaderSql} WHERE package_id = @PackageId;", new { PackageId = packageId }, cancellationToken: cancellationToken));
    }

    /// <summary>One serializable transaction owns both track transitions, history and snapshot deletion.</summary>
    public async Task<EncPackageDiscardResult> TryDiscardPackageAsync(Guid expectedPackageId, string actor, DateTime nowUtc, CancellationToken cancellationToken = default) {
        if (expectedPackageId == Guid.Empty) throw new ArgumentException("A package identifier is required.", nameof(expectedPackageId));
        if (nowUtc.Kind != DateTimeKind.Utc) throw new ArgumentException("Discard requires UTC time.", nameof(nowUtc));
        if (string.IsNullOrWhiteSpace(actor)) throw new ArgumentException("A discard actor is required.", nameof(actor));

        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition(
            $"{SelectHeaderSql} WITH (UPDLOCK, HOLDLOCK) WHERE package_id = @PackageId;",
            new { PackageId = expectedPackageId }, transaction, cancellationToken: cancellationToken));
        if (package is null) return new(EncPackageDiscardStatus.NotFound, []);

        // A pending replay may contain edits newer than this snapshot. Without a durable
        // per-source discard tombstone, deleting that replay or processing it blindly is unsafe.
        // Fail closed until the newer source revision has been reconciled.
        var pendingReplay = await connection.ExecuteScalarAsync<int>(new CommandDefinition("""
            SELECT COUNT(1) FROM dbo.EncPackageReplay WITH (UPDLOCK, HOLDLOCK)
            WHERE source_dataset_name = @SourceDatasetName;
            """, new { package.SourceDatasetName }, transaction, cancellationToken: cancellationToken));
        if (pendingReplay != 0) return new(EncPackageDiscardStatus.Conflict, []);

        var members = new (string DatasetName, ProductSpecification Specification, bool Discarded)[] {
            (package.SourceDatasetName, ProductSpecification.S101, package.S101Discarded),
            (package.S57DatasetName, ProductSpecification.S57, package.S57Discarded)
        };
        var candidates = new List<DiscardTrack>(2);
        foreach (var member in members) {
            var track = await connection.QuerySingleOrDefaultAsync<DiscardTrack>(new CommandDefinition("""
                SELECT t.product_export_track_id AS Id, t.state AS State,
                       t.candidate_previous_state AS PreviousState,
                       t.candidate_edition AS Edition, t.candidate_update AS [Update],
                       CONVERT(bit, CASE WHEN EXISTS (
                           SELECT 1 FROM dbo.ProductExportTrackFreezeHold h WHERE h.product_export_track_id = t.product_export_track_id
                       ) THEN 1 ELSE 0 END) AS IsFrozen
                FROM dbo.ProductExportTrack t WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.Product p ON p.product_id = t.product_id
                WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification;
                """, new { member.DatasetName, Specification = member.Specification.ToString() }, transaction, cancellationToken: cancellationToken));
            if (track is null || track.IsFrozen ||
                track.Edition.HasValue != track.Update.HasValue ||
                track.State is ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Published or ProductState.Exporting or ProductState.Validating or ProductState.Frozen ||
                track.PreviousState is ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.ReadyForDistribution or ProductState.Published or ProductState.Exporting or ProductState.Validating or ProductState.Frozen ||
                (member.Discarded && (track.Edition.HasValue || track.PreviousState.HasValue)) ||
                (!member.Discarded && track.State is not (ProductState.ReadyForDistribution or ProductState.Error or ProductState.Rejected)) ||
                (!member.Discarded && !track.Edition.HasValue && track.State is not (ProductState.Error or ProductState.Rejected)))
                return new(EncPackageDiscardStatus.Conflict, []);
            track.Discarded = member.Discarded;
            track.DatasetName = member.DatasetName;
            track.Specification = member.Specification;
            candidates.Add(track);
        }
        foreach (var track in candidates.Where(value => !value.Discarded)) {
            // Reject a candidate with any reservation, including uncertain or awaiting external result.
            var reserved = await connection.ExecuteScalarAsync<int>(new CommandDefinition("""
                SELECT COUNT(1) FROM dbo.ProductIcEncDelivery d WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                WHERE d.product_export_track_id = @TrackId
                  AND (@Edition IS NULL OR @Update IS NULL OR
                       (r.edition_number = @Edition AND r.update_number = @Update));
                """, new { TrackId = track.Id, track.Edition, track.Update }, transaction, cancellationToken: cancellationToken));
            if (reserved > 0) return new(EncPackageDiscardStatus.Conflict, []);
        }

        var outputs = new List<EncPackageDiscardOutput>(2);
        foreach (var track in candidates.Where(value => !value.Discarded)) {
            var restored = ProductCandidateRecovery.RestoredState(track.PreviousState);
            var restoredAt = nowUtc.AddTicks(1);
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
                SELECT @CancelledHistory, product_export_track_id, @Cancelled,
                       COALESCE(candidate_edition, published_edition), COALESCE(candidate_update, published_update),
                       @Actor, @NowUtc FROM dbo.ProductExportTrack WHERE product_export_track_id = @TrackId;
                UPDATE dbo.ProductExportTrack
                SET state = @Restored, candidate_edition = NULL, candidate_update = NULL,
                    candidate_previous_state = NULL, updated_at_utc = @RestoredAt
                WHERE product_export_track_id = @TrackId;
                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
                SELECT @RestoredHistory, product_export_track_id, @Restored, published_edition,
                       published_update, @Actor, @RestoredAt FROM dbo.ProductExportTrack
                WHERE product_export_track_id = @TrackId;
                """, new { TrackId = track.Id, CancelledHistory = Guid.NewGuid(), Cancelled = ProductState.Cancelled,
                    Restored = restored, RestoredHistory = Guid.NewGuid(), Actor = actor, NowUtc = nowUtc, RestoredAt = restoredAt }, transaction, cancellationToken: cancellationToken));
            if (track.Edition.HasValue && track.Update.HasValue)
                outputs.Add(new(track.DatasetName, track.Specification, track.Edition.Value, track.Update.Value));
        }
        var deleted = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.EncPackage WHERE package_id = @PackageId;",
            new { PackageId = expectedPackageId }, transaction, cancellationToken: cancellationToken));
        if (deleted != 1) throw new InvalidOperationException("The ENC package changed during discard.");
        // No replay marker is inserted: an identical source revision cannot regenerate this candidate.
        transaction.Commit();
        return new(EncPackageDiscardStatus.Discarded, outputs);
    }

    private sealed class DiscardTrack {
        public Guid Id { get; set; }
        public string DatasetName { get; set; } = string.Empty;
        public ProductSpecification Specification { get; set; }
        public ProductState State { get; set; }
        public ProductState? PreviousState { get; set; }
        public int? Edition { get; set; }
        public int? Update { get; set; }
        public bool IsFrozen { get; set; }
        public bool Discarded { get; set; }
    }

    public async Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        return await connection.QuerySingleOrDefaultAsync<DateTime?>(new CommandDefinition("SELECT MIN(scan_from_utc) FROM dbo.EncPackageReplay;", cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var rows = await connection.QueryAsync<ReplayRow>(new CommandDefinition("SELECT source_dataset_name AS SourceDatasetName, scan_from_utc AS ScanFromUtc FROM dbo.EncPackageReplay;", cancellationToken: cancellationToken));
        return rows.ToDictionary(row => row.SourceDatasetName, row => DateTime.SpecifyKind(row.ScanFromUtc, DateTimeKind.Utc), StringComparer.OrdinalIgnoreCase);
    }

    /// <inheritdoc/>
    public async Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        await UpsertReplayAsync(connection, transaction, sourceDatasetName, scanFromUtc, cancellationToken);
        transaction.Commit();
    }

    /// <inheritdoc/>
    public async Task ClearReplayAsync(string sourceDatasetName, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        await connection.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.EncPackageReplay WHERE source_dataset_name = @SourceDatasetName;", new { SourceDatasetName = sourceDatasetName }, cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var affected = await connection.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.EncPackage (package_id, source_dataset_name, s57_dataset_name, scan_from_utc, detected_at_utc, dataset_yaml, summary_yaml, error_message)
            SELECT @Id, @SourceDatasetName, @S57DatasetName, @ScanFromUtc, @DetectedAtUtc, @DatasetYaml, @SummaryYaml, @ErrorMessage
            WHERE NOT EXISTS (SELECT 1 FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK) WHERE source_dataset_name = @SourceDatasetName);
            """, package, transaction, cancellationToken: cancellationToken));
        if (affected == 1)
            await connection.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.EncPackageReplay WHERE source_dataset_name = @SourceDatasetName;", new { package.SourceDatasetName }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
        return affected == 1;
    }

    /// <inheritdoc/>
    public async Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var affected = await connection.ExecuteAsync(new CommandDefinition("UPDATE dbo.EncPackage SET error_message = @Message WHERE package_id = @PackageId;", new { PackageId = packageId, Message = message[..Math.Min(message.Length, 1024)] }, cancellationToken: cancellationToken));
        if (affected != 1)
            throw new InvalidOperationException($"ENC package '{packageId}' was not available to record its export failure.");
    }

    /// <inheritdoc/>
    public async Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default, bool preserveScanBound = false) {
        if (specification is not (ProductSpecification.S57 or ProductSpecification.S101))
            throw new ArgumentOutOfRangeException(nameof(specification));

        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var where = specification == ProductSpecification.S57 ? "s57_dataset_name" : "source_dataset_name";
        var flag = specification == ProductSpecification.S57 ? "s57_discarded" : "s101_discarded";
        // The identifiers are selected exclusively from the two fixed enum cases above.
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition($"{SelectHeaderSql} WITH (UPDLOCK, HOLDLOCK) WHERE {where} = @DatasetName", new { DatasetName = datasetName }, transaction, cancellationToken: cancellationToken));
        if (package is null)
            throw new InvalidOperationException("No active ENC package contains this export.");

        await connection.ExecuteAsync(new CommandDefinition($"UPDATE dbo.EncPackage SET {flag} = 1, error_message = NULL WHERE package_id = @Id", new { package.Id }, transaction, cancellationToken: cancellationToken));
        if ((specification == ProductSpecification.S57 || package.S57Discarded) && (specification == ProductSpecification.S101 || package.S101Discarded)) {
            if (preserveScanBound)
                await UpsertReplayAsync(connection, transaction, package.SourceDatasetName, package.ScanFromUtc, cancellationToken);
            await connection.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.EncPackage WHERE package_id = @Id", new { package.Id }, transaction, cancellationToken: cancellationToken));
        }
        transaction.Commit();
    }

    private static Task UpsertReplayAsync(IDbConnection connection, IDbTransaction transaction, string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken) => connection.ExecuteAsync(new CommandDefinition("""
        UPDATE dbo.EncPackageReplay WITH (UPDLOCK, HOLDLOCK)
        SET scan_from_utc = CASE WHEN scan_from_utc < @ScanFromUtc THEN scan_from_utc ELSE @ScanFromUtc END
        WHERE source_dataset_name = @SourceDatasetName;
        IF @@ROWCOUNT = 0
            INSERT INTO dbo.EncPackageReplay (source_dataset_name, scan_from_utc) VALUES (@SourceDatasetName, @ScanFromUtc);
        """, new { SourceDatasetName = sourceDatasetName, ScanFromUtc = scanFromUtc }, transaction, cancellationToken: cancellationToken));

    private const string SelectHeaderSql = """
        SELECT package_id AS Id, source_dataset_name AS SourceDatasetName, s57_dataset_name AS S57DatasetName,
               scan_from_utc AS ScanFromUtc, detected_at_utc AS DetectedAtUtc,
               s57_discarded AS S57Discarded, s101_discarded AS S101Discarded,
               error_message AS ErrorMessage FROM dbo.EncPackage
        """;

    private const string SelectSql = """
        SELECT package_id AS Id, source_dataset_name AS SourceDatasetName, s57_dataset_name AS S57DatasetName,
               scan_from_utc AS ScanFromUtc, detected_at_utc AS DetectedAtUtc, dataset_yaml AS DatasetYaml,
               summary_yaml AS SummaryYaml, s57_discarded AS S57Discarded, s101_discarded AS S101Discarded,
               error_message AS ErrorMessage FROM dbo.EncPackage
        """;

    private sealed class ReplayRow
    {
        public string SourceDatasetName { get; set; } = string.Empty;
        public DateTime ScanFromUtc { get; set; }
    }
}
