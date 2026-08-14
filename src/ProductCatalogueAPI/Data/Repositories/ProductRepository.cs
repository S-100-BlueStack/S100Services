using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using System.Data;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Stores product workflow state in normalized SQL tables. S-128 is deliberately not used as temporary workflow storage.
/// </summary>
public sealed class ProductRepository(DbConnectionFactory connectionFactory) : IProductRepository, IProductWorkflowRepository
{
    private static readonly DateTime MaxDate = new(9999, 12, 31);
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;

    /// <inheritdoc/>
    public async Task AppendAsync(string name, ProductState state, string productSpecification, uint editionNo, uint? updateNo, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null) {
        var specification = ParseProductSpecification(productSpecification);
        var track = await GetOrCreateTrackAsync(name, specification, GetEngine(specification), checked((int)editionNo), checked((int)(updateNo ?? 0)));

        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction();
        var occurredAtUtc = DateTime.UtcNow;

        await connection.ExecuteAsync("""
            UPDATE dbo.ProductExportTrack
            SET state = @State,
                candidate_edition = CASE WHEN @State IN (1, 5, 7, 13, 14, 15) THEN candidate_edition ELSE @Edition END,
                candidate_update = CASE WHEN @State IN (1, 5, 7, 13, 14, 15) THEN candidate_update ELSE @Update END,
                updated_at_utc = @OccurredAtUtc
            WHERE product_export_track_id = @TrackId;

            INSERT INTO dbo.ProductStateHistory
                (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
            VALUES
                (@HistoryId, @TrackId, @State, @Edition, @Update, @Owner, @OccurredAtUtc);
            """, new {
                TrackId = track.Id,
                State = state,
                Edition = checked((int)editionNo),
                Update = checked((int)(updateNo ?? 0)),
                Owner = owner,
                OccurredAtUtc = occurredAtUtc,
                HistoryId = Guid.NewGuid()
            }, transaction);

        if (attachment is not null) {
            await connection.ExecuteAsync("""
                INSERT INTO dbo.ProductArtifact
                    (product_artifact_id, product_export_track_id, product_revision_id, artifact_kind, file_name, media_type, content, sha256, created_at_utc)
                VALUES
                    (@ArtifactId, @TrackId, NULL, @Kind, @FileName, @MediaType, @Content, HASHBYTES('SHA2_256', @Content), @OccurredAtUtc);
                """, new {
                    ArtifactId = Guid.NewGuid(),
                    TrackId = track.Id,
                    Kind = ProductArtifactKind.ValidationReport.ToString(),
                    FileName = attachmentFileName ?? "attachment.bin",
                    MediaType = "application/octet-stream",
                    Content = attachment,
                    OccurredAtUtc = occurredAtUtc
                }, transaction);
        }

        transaction.Commit();
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ProductRecord>> GetCurrentAsync() {
        using var connection = _connectionFactory.Create();
        return await connection.QueryAsync<ProductRecord>(CurrentRecordsSql);
    }

    /// <inheritdoc/>
    public async Task<ProductRecord?> GetCurrentByNameAsync(string name) {
        using var connection = _connectionFactory.Create();
        return await connection.QueryFirstOrDefaultAsync<ProductRecord>($"{CurrentRecordsSql}\nAND DatasetName = @Name", new { Name = name });
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names) {
        var requestedNames = names.Where(name => !string.IsNullOrWhiteSpace(name)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (requestedNames.Length == 0)
            return [];

        using var connection = _connectionFactory.Create();
        return await connection.QueryAsync<ProductRecord>($"{CurrentRecordsSql}\nAND DatasetName IN @Names", new { Names = requestedNames });
    }

    /// <inheritdoc/>
    public async Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName) {
        using var connection = _connectionFactory.Create();
        return await connection.QueryFirstOrDefaultAsync<DateTime?>("""
            SELECT TOP 1 last_successful_run_utc
            FROM dbo.JobRunState
            WHERE job_name = @JobName
            ORDER BY id DESC;
            """, new { JobName = jobName });
    }

    /// <inheritdoc/>
    public async Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime) {
        using var connection = _connectionFactory.Create();
        await connection.ExecuteAsync("""
            INSERT INTO dbo.JobRunState (job_name, last_successful_run_utc)
            VALUES (@JobName, @LastSuccessfulRunUtc);
            """, new { JobName = jobName, LastSuccessfulRunUtc = dateTime });
    }

    /// <inheritdoc/>
    public async Task<string[]> GetIneligbleProductsAsync() {
        using var connection = _connectionFactory.Create();
        var result = await connection.QueryAsync<string>("""
            SELECT DISTINCT p.dataset_name
            FROM dbo.Product p
            INNER JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id
            WHERE t.state IN @States;
            """, new { States = new[] { ProductState.Frozen, ProductState.InTransit, ProductState.Exporting, ProductState.Validating } });
        return [.. result];
    }

    /// <inheritdoc/>
    public async Task<string[]> GetEligibleProductsAsync() {
        using var connection = _connectionFactory.Create();
        var result = await connection.QueryAsync<string>("""
            SELECT p.dataset_name
            FROM dbo.Product p
            WHERE NOT EXISTS (
                SELECT 1
                FROM dbo.ProductExportTrack t
                WHERE t.product_id = p.product_id
                  AND t.state IN @States
            );
            """, new { States = new[] { ProductState.Frozen, ProductState.InTransit, ProductState.Exporting, ProductState.Validating } });
        return [.. result];
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name) {
        using var connection = _connectionFactory.Create();
        return await connection.QueryAsync<ProductRecord>($"{HistorySql}\nWHERE p.dataset_name = @Name\nORDER BY h.occurred_at_utc DESC", new { Name = name, MaxDate });
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive) {
        using var connection = _connectionFactory.Create();
        return await connection.QueryAsync<ProductRecord>($"{HistorySql}\nWHERE h.occurred_at_utc >= @FromInclusive AND h.occurred_at_utc < @ToExclusive\nORDER BY h.occurred_at_utc DESC", new { FromInclusive = fromInclusive, ToExclusive = toExclusive, MaxDate });
    }

    /// <inheritdoc/>
    public async Task<ProductExportTrackRecord?> GetTrackAsync(string datasetName, ProductSpecification productSpecification, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        return await connection.QuerySingleOrDefaultAsync<ProductExportTrackRecord>(new CommandDefinition(TrackSelectSql, new { DatasetName = datasetName, ProductSpecification = productSpecification.ToString() }, cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<ProductExportTrackRecord> GetOrCreateTrackAsync(string datasetName, ProductSpecification productSpecification, ExportEngineKind engine, int publishedEdition, int publishedUpdate, CancellationToken cancellationToken = default) {
        if (string.IsNullOrWhiteSpace(datasetName))
            throw new ArgumentException("A dataset name is required.", nameof(datasetName));
        if (publishedEdition < 0)
            throw new ArgumentOutOfRangeException(nameof(publishedEdition));
        if (publishedUpdate < 0)
            throw new ArgumentOutOfRangeException(nameof(publishedUpdate));

        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var now = DateTime.UtcNow;

        var productId = await connection.QuerySingleOrDefaultAsync<Guid?>(new CommandDefinition("""
            SELECT product_id
            FROM dbo.Product WITH (UPDLOCK, HOLDLOCK)
            WHERE dataset_name = @DatasetName;
            """, new { DatasetName = datasetName }, transaction, cancellationToken: cancellationToken));

        if (!productId.HasValue) {
            productId = Guid.NewGuid();
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT INTO dbo.Product (product_id, dataset_name, created_at_utc)
                VALUES (@ProductId, @DatasetName, @Now);
                """, new { ProductId = productId, DatasetName = datasetName, Now = now }, transaction, cancellationToken: cancellationToken));
        }

        var trackId = await connection.QuerySingleOrDefaultAsync<Guid?>(new CommandDefinition("""
            SELECT product_export_track_id
            FROM dbo.ProductExportTrack WITH (UPDLOCK, HOLDLOCK)
            WHERE product_id = @ProductId AND product_specification = @ProductSpecification;
            """, new { ProductId = productId, ProductSpecification = productSpecification.ToString() }, transaction, cancellationToken: cancellationToken));

        if (!trackId.HasValue) {
            trackId = Guid.NewGuid();
            var historyId = Guid.NewGuid();
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT INTO dbo.ProductExportTrack
                    (product_export_track_id, product_id, product_specification, export_engine, state, published_edition, published_update, updated_at_utc)
                VALUES
                    (@TrackId, @ProductId, @ProductSpecification, @Engine, @State, @PublishedEdition, @PublishedUpdate, @Now);

                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
                VALUES
                    (@HistoryId, @TrackId, @State, @PublishedEdition, @PublishedUpdate, 'system', @Now);
                """, new {
                    TrackId = trackId,
                    ProductId = productId,
                    ProductSpecification = productSpecification.ToString(),
                    Engine = engine.ToString(),
                    State = ProductState.Idle,
                    PublishedEdition = publishedEdition,
                    PublishedUpdate = publishedUpdate,
                    HistoryId = historyId,
                    Now = now
                }, transaction, cancellationToken: cancellationToken));
        }

        var result = await connection.QuerySingleAsync<ProductExportTrackRecord>(new CommandDefinition(TrackSelectByIdSql, new { TrackId = trackId }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
        return result;
    }

    /// <inheritdoc/>
    public async Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var affected = await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.ProductExportTrack
            SET state = @State, candidate_edition = @CandidateEdition, candidate_update = @CandidateUpdate, updated_at_utc = @OccurredAtUtc
            WHERE product_export_track_id = @TrackId
              AND state NOT IN (@Frozen, @InTransit, @Exporting, @Validating);

            IF @@ROWCOUNT = 1
                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
                VALUES
                    (@HistoryId, @TrackId, @State, @CandidateEdition, @CandidateUpdate, @Owner, @OccurredAtUtc);
            """, new {
                TrackId = trackId,
                State = ProductState.Exporting,
                CandidateEdition = candidateEdition,
                CandidateUpdate = candidateUpdate,
                Owner = owner,
                OccurredAtUtc = occurredAtUtc,
                HistoryId = Guid.NewGuid(),
                Frozen = ProductState.Frozen,
                InTransit = ProductState.InTransit,
                Exporting = ProductState.Exporting,
                Validating = ProductState.Validating
            }, cancellationToken: cancellationToken));

        if (affected == 0)
            throw new InvalidOperationException("The export track changed state before the export could start.");
    }

    /// <inheritdoc/>
    public async Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.ProductExportTrack
            SET state = @State, updated_at_utc = @OccurredAtUtc
            WHERE product_export_track_id = @TrackId;

            INSERT INTO dbo.ProductStateHistory
                (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc, error_code, error_message)
            SELECT @HistoryId, product_export_track_id, @State,
                   COALESCE(candidate_edition, published_edition), COALESCE(candidate_update, published_update),
                   @Owner, @OccurredAtUtc, @ErrorCode, @ErrorMessage
            FROM dbo.ProductExportTrack
            WHERE product_export_track_id = @TrackId;
            """, new { TrackId = trackId, State = state, Owner = owner, OccurredAtUtc = occurredAtUtc, ErrorCode = errorCode, ErrorMessage = errorMessage, HistoryId = Guid.NewGuid() }, cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task CancelCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        await connection.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.ProductStateHistory
                (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
            SELECT @HistoryId, product_export_track_id, @State,
                   COALESCE(candidate_edition, published_edition), COALESCE(candidate_update, published_update),
                   @Owner, @OccurredAtUtc
            FROM dbo.ProductExportTrack
            WHERE product_export_track_id = @TrackId;

            UPDATE dbo.ProductExportTrack
            SET state = @State, candidate_edition = NULL, candidate_update = NULL, updated_at_utc = @OccurredAtUtc
            WHERE product_export_track_id = @TrackId;
            """, new { TrackId = trackId, State = ProductState.Cancelled, Owner = owner, OccurredAtUtc = occurredAtUtc, HistoryId = Guid.NewGuid() }, cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default) {
        var revisionId = Guid.NewGuid();
        using var connection = _connectionFactory.Create();
        await connection.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.ProductRevision
                (product_revision_id, product_export_track_id, revision_type, edition_number, update_number, dataset_yaml, change_summary_yaml, created_by, created_at_utc)
            VALUES
                (@RevisionId, @TrackId, @RevisionType, @Edition, @Update, @DatasetYaml, @ChangeSummaryYaml, @CreatedBy, @CreatedAtUtc);
            """, new {
                RevisionId = revisionId,
                revision.TrackId,
                RevisionType = revision.RevisionType.ToString(),
                revision.Edition,
                revision.Update,
                revision.DatasetYaml,
                revision.ChangeSummaryYaml,
                revision.CreatedBy,
                revision.CreatedAtUtc
            }, cancellationToken: cancellationToken));
        return revisionId;
    }

    /// <inheritdoc/>
    public async Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        await connection.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.ProductArtifact
                (product_artifact_id, product_export_track_id, product_revision_id, artifact_kind, file_name, media_type, content, sha256, metadata_json, created_at_utc)
            VALUES
                (@ArtifactId, @TrackId, @RevisionId, @Kind, @FileName, @MediaType, @Content, @Sha256, @MetadataJson, @CreatedAtUtc);
            """, new {
                ArtifactId = Guid.NewGuid(),
                artifact.TrackId,
                artifact.RevisionId,
                Kind = artifact.Kind.ToString(),
                artifact.FileName,
                artifact.MediaType,
                artifact.Content,
                Sha256 = artifact.ComputeSha256(),
                artifact.MetadataJson,
                artifact.CreatedAtUtc
            }, cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<ProductChangeSummary?> GetOpenChangeSummaryAsync(Guid trackId, DateOnly workDate, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var header = await connection.QuerySingleOrDefaultAsync<ChangeSummaryHeader>(new CommandDefinition(ChangeSummaryHeaderSql + " AND s.product_export_track_id = @TrackId AND s.work_date = @WorkDate", new { TrackId = trackId, WorkDate = workDate.ToDateTime(TimeOnly.MinValue) }, cancellationToken: cancellationToken));
        return header is null ? null : await LoadSummaryAsync(connection, header, cancellationToken);
    }

    /// <inheritdoc/>
    public async Task SaveChangeSummaryAsync(ProductChangeSummary summary, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction();
        var actualSummaryId = await connection.QuerySingleAsync<Guid>(new CommandDefinition("""
            MERGE dbo.ProductChangeSummary WITH (HOLDLOCK) AS target
            USING (SELECT @TrackId AS product_export_track_id, @WorkDate AS work_date) AS source
              ON target.product_export_track_id = source.product_export_track_id AND target.work_date = source.work_date
            WHEN MATCHED THEN
              UPDATE SET summary_yaml = @Yaml, first_detected_at_utc = @FirstDetectedAtUtc, last_detected_at_utc = @LastDetectedAtUtc
            WHEN NOT MATCHED THEN
              INSERT (product_change_summary_id, product_export_track_id, work_date, summary_yaml, first_detected_at_utc, last_detected_at_utc, is_closed)
              VALUES (@SummaryId, source.product_export_track_id, source.work_date, @Yaml, @FirstDetectedAtUtc, @LastDetectedAtUtc, 0)
            OUTPUT inserted.product_change_summary_id;
            """, new {
                SummaryId = summary.Id,
                summary.TrackId,
                WorkDate = summary.WorkDate.ToDateTime(TimeOnly.MinValue),
                summary.Yaml,
                summary.FirstDetectedAtUtc,
                summary.LastDetectedAtUtc
            }, transaction, cancellationToken: cancellationToken));

        await connection.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.ProductChange WHERE product_change_summary_id = @SummaryId;", new { SummaryId = actualSummaryId }, transaction, cancellationToken: cancellationToken));

        foreach (var change in summary.Changes) {
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT INTO dbo.ProductChange
                    (product_change_id, product_change_summary_id, feature_id, feature_code, attribute_path, deleted, detected_at_utc)
                VALUES
                    (@ChangeId, @SummaryId, @FeatureId, @FeatureCode, @AttributePath, @Deleted, @DetectedAtUtc);
                """, new {
                    ChangeId = Guid.NewGuid(),
                    SummaryId = actualSummaryId,
                    change.FeatureId,
                    change.FeatureCode,
                    change.AttributePath,
                    change.Deleted,
                    change.DetectedAtUtc
                }, transaction, cancellationToken: cancellationToken));
        }

        transaction.Commit();
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyList<ProductChangeSummary>> GetOpenChangeSummariesAsync(CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var headers = (await connection.QueryAsync<ChangeSummaryHeader>(new CommandDefinition(ChangeSummaryHeaderSql, cancellationToken: cancellationToken))).ToArray();
        var summaries = new List<ProductChangeSummary>(headers.Length);
        foreach (var header in headers)
            summaries.Add(await LoadSummaryAsync(connection, header, cancellationToken));
        return summaries;
    }

    /// <inheritdoc/>
    public async Task CloseChangeSummaryAsync(Guid summaryId, DateTime closedAtUtc, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.ProductChangeSummary
            SET is_closed = 1, closed_at_utc = @ClosedAtUtc
            WHERE product_change_summary_id = @SummaryId AND is_closed = 0;
            """, new { SummaryId = summaryId, ClosedAtUtc = closedAtUtc }, cancellationToken: cancellationToken));
    }

    private static async Task<ProductChangeSummary> LoadSummaryAsync(IDbConnection connection, ChangeSummaryHeader header, CancellationToken cancellationToken) {
        var changes = (await connection.QueryAsync<ProductChange>(new CommandDefinition("""
            SELECT feature_id AS FeatureId, feature_code AS FeatureCode, attribute_path AS AttributePath,
                   detected_at_utc AS DetectedAtUtc, deleted AS Deleted
            FROM dbo.ProductChange
            WHERE product_change_summary_id = @SummaryId
            ORDER BY feature_id, attribute_path;
            """, new { SummaryId = header.Id }, cancellationToken: cancellationToken))).ToArray();
        return new ProductChangeSummary(header.Id, header.TrackId, header.DatasetName, header.ProductSpecification, DateOnly.FromDateTime(header.WorkDate), header.Yaml, changes, header.FirstDetectedAtUtc, header.LastDetectedAtUtc);
    }

    private static ProductSpecification ParseProductSpecification(string value) => value.Trim().ToUpperInvariant() switch {
        "S-57" or "S57" => ProductSpecification.S57,
        "S-102" or "S102" => ProductSpecification.S102,
        "S-122" or "S122" => ProductSpecification.S122,
        "S-101" or "S101" or "S-128" or "S128" => ProductSpecification.S101,
        _ => throw new ArgumentException($"Unsupported product specification '{value}'.", nameof(value))
    };

    private static ExportEngineKind GetEngine(ProductSpecification specification) => specification switch {
        ProductSpecification.S57 or ProductSpecification.S101 => ExportEngineKind.IsoIec8211,
        ProductSpecification.S102 => ExportEngineKind.Hdf5,
        ProductSpecification.S122 => ExportEngineKind.Gml,
        _ => throw new ArgumentOutOfRangeException(nameof(specification), specification, null)
    };

    private const string CurrentRecordsSql = """
        WITH RankedTracks AS (
            SELECT h.product_state_history_id AS Id, p.dataset_name AS Name, t.state AS State,
                   t.product_specification AS ProductSpecification,
                   COALESCE(t.candidate_edition, t.published_edition) AS EditionNo,
                   COALESCE(t.candidate_update, t.published_update) AS UpdateNo,
                   h.owner AS Owner, h.occurred_at_utc AS Date_From,
                   CAST('9999-12-31T00:00:00' AS datetime2) AS Date_to,
                   ROW_NUMBER() OVER (PARTITION BY p.product_id ORDER BY CASE t.product_specification WHEN 'S101' THEN 0 ELSE 1 END, t.updated_at_utc DESC) AS RowNumber
            FROM dbo.Product p
            INNER JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id
            OUTER APPLY (
                SELECT TOP 1 * FROM dbo.ProductStateHistory h
                WHERE h.product_export_track_id = t.product_export_track_id
                ORDER BY h.occurred_at_utc DESC, h.product_state_history_id DESC
            ) h
        )
        SELECT Id, Name, State, ProductSpecification, EditionNo, UpdateNo, Owner, Date_From, Date_to
        FROM RankedTracks
        WHERE RowNumber = 1
        """;

    private const string HistorySql = """
        SELECT h.product_state_history_id AS Id, p.dataset_name AS Name, h.state AS State,
               t.product_specification AS ProductSpecification, h.edition_number AS EditionNo,
               h.update_number AS UpdateNo, h.owner AS Owner, h.occurred_at_utc AS Date_From,
               COALESCE(LEAD(h.occurred_at_utc) OVER (PARTITION BY h.product_export_track_id ORDER BY h.occurred_at_utc), @MaxDate) AS Date_to
        FROM dbo.ProductStateHistory h
        INNER JOIN dbo.ProductExportTrack t ON t.product_export_track_id = h.product_export_track_id
        INNER JOIN dbo.Product p ON p.product_id = t.product_id
        """;

    private const string TrackSelectSql = """
        SELECT t.product_export_track_id AS Id, p.dataset_name AS DatasetName,
               t.product_specification AS ProductSpecification, t.export_engine AS Engine,
               t.state AS State, t.published_edition AS PublishedEdition, t.published_update AS PublishedUpdate,
               t.candidate_edition AS CandidateEdition, t.candidate_update AS CandidateUpdate, t.updated_at_utc AS UpdatedAtUtc
        FROM dbo.ProductExportTrack t
        INNER JOIN dbo.Product p ON p.product_id = t.product_id
        WHERE p.dataset_name = @DatasetName AND t.product_specification = @ProductSpecification;
        """;

    private const string TrackSelectByIdSql = """
        SELECT t.product_export_track_id AS Id, p.dataset_name AS DatasetName,
               t.product_specification AS ProductSpecification, t.export_engine AS Engine,
               t.state AS State, t.published_edition AS PublishedEdition, t.published_update AS PublishedUpdate,
               t.candidate_edition AS CandidateEdition, t.candidate_update AS CandidateUpdate, t.updated_at_utc AS UpdatedAtUtc
        FROM dbo.ProductExportTrack t
        INNER JOIN dbo.Product p ON p.product_id = t.product_id
        WHERE t.product_export_track_id = @TrackId;
        """;

    private const string ChangeSummaryHeaderSql = """
        SELECT s.product_change_summary_id AS Id, s.product_export_track_id AS TrackId,
               p.dataset_name AS DatasetName, t.product_specification AS ProductSpecification,
               s.work_date AS WorkDate, s.summary_yaml AS Yaml,
               s.first_detected_at_utc AS FirstDetectedAtUtc, s.last_detected_at_utc AS LastDetectedAtUtc
        FROM dbo.ProductChangeSummary s
        INNER JOIN dbo.ProductExportTrack t ON t.product_export_track_id = s.product_export_track_id
        INNER JOIN dbo.Product p ON p.product_id = t.product_id
        WHERE s.is_closed = 0
        """;

    private sealed class ChangeSummaryHeader
    {
        public Guid Id { get; set; }
        public Guid TrackId { get; set; }
        public string DatasetName { get; set; } = string.Empty;
        public ProductSpecification ProductSpecification { get; set; }
        public DateTime WorkDate { get; set; }
        public string Yaml { get; set; } = string.Empty;
        public DateTime FirstDetectedAtUtc { get; set; }
        public DateTime LastDetectedAtUtc { get; set; }
    }
}

/// <summary>
/// In-memory implementation used by deterministic tests and local development.
/// </summary>
public sealed class InMemoryProductRepository : IProductRepository, IProductWorkflowRepository
{
    private readonly object _gate = new();
    private readonly List<ProductRecord> _products = [];
    private readonly Dictionary<string, DateTime> _lastSuccessfulRuns = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<(string Name, ProductSpecification Specification), ProductExportTrackRecord> _tracks = new();
    private readonly Dictionary<Guid, ProductChangeSummary> _summaries = [];
    private readonly List<ProductRevisionWrite> _revisions = [];
    private readonly List<ProductArtifactWrite> _artifacts = [];

    /// <inheritdoc/>
    public Task AppendAsync(string name, ProductState state, string productSpecification, uint editionNo, uint? updateNo, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null) {
        lock (_gate) {
            var now = DateTime.UtcNow;
            foreach (var product in _products.Where(product => product.Name == name && product.Date_to == MaxDate))
                product.Date_to = now;
            _products.Add(new ProductRecord { Id = Guid.NewGuid(), Name = name, State = state, ProductSpecification = productSpecification, EditionNo = checked((int)editionNo), UpdateNo = checked((int)(updateNo ?? 0)), Owner = owner, Date_From = now, Date_to = MaxDate });
        }
        return Task.CompletedTask;
    }

    /// <inheritdoc/>
    public Task<IEnumerable<ProductRecord>> GetCurrentAsync() { lock (_gate) return Task.FromResult(_products.GroupBy(product => product.Name).Select(group => group.OrderByDescending(product => product.Date_From).First()).AsEnumerable()); }

    /// <inheritdoc/>
    public Task<ProductRecord?> GetCurrentByNameAsync(string name) { lock (_gate) return Task.FromResult(_products.Where(product => product.Name == name).OrderByDescending(product => product.Date_From).FirstOrDefault()); }

    /// <inheritdoc/>
    public Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names) { var requested = names.ToHashSet(StringComparer.OrdinalIgnoreCase); lock (_gate) return Task.FromResult(_products.Where(product => requested.Contains(product.Name)).GroupBy(product => product.Name).Select(group => group.OrderByDescending(product => product.Date_From).First()).AsEnumerable()); }

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
    public Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { lock (_gate) { var track = FindTrack(trackId); track.State = ProductState.Exporting; track.CandidateEdition = candidateEdition; track.CandidateUpdate = candidateUpdate; track.UpdatedAtUtc = occurredAtUtc; } return Task.CompletedTask; }

    /// <inheritdoc/>
    public Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default) { lock (_gate) { var track = FindTrack(trackId); track.State = state; track.UpdatedAtUtc = occurredAtUtc; } return Task.CompletedTask; }

    /// <inheritdoc/>
    public Task CancelCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { lock (_gate) { var track = FindTrack(trackId); track.State = ProductState.Cancelled; track.CandidateEdition = null; track.CandidateUpdate = null; track.UpdatedAtUtc = occurredAtUtc; } return Task.CompletedTask; }

    /// <inheritdoc/>
    public Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default) { lock (_gate) _revisions.Add(revision); return Task.FromResult(Guid.NewGuid()); }

    /// <inheritdoc/>
    public Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default) { lock (_gate) _artifacts.Add(artifact); return Task.CompletedTask; }

    /// <inheritdoc/>
    public Task<ProductChangeSummary?> GetOpenChangeSummaryAsync(Guid trackId, DateOnly workDate, CancellationToken cancellationToken = default) { lock (_gate) return Task.FromResult(_summaries.Values.SingleOrDefault(summary => summary.TrackId == trackId && summary.WorkDate == workDate)); }

    /// <inheritdoc/>
    public Task SaveChangeSummaryAsync(ProductChangeSummary summary, CancellationToken cancellationToken = default) { lock (_gate) _summaries[summary.Id] = summary; return Task.CompletedTask; }

    /// <inheritdoc/>
    public Task<IReadOnlyList<ProductChangeSummary>> GetOpenChangeSummariesAsync(CancellationToken cancellationToken = default) { lock (_gate) return Task.FromResult<IReadOnlyList<ProductChangeSummary>>([.. _summaries.Values]); }

    /// <inheritdoc/>
    public Task CloseChangeSummaryAsync(Guid summaryId, DateTime closedAtUtc, CancellationToken cancellationToken = default) { lock (_gate) _summaries.Remove(summaryId); return Task.CompletedTask; }

    private ProductExportTrackRecord FindTrack(Guid trackId) => _tracks.Values.Single(track => track.Id == trackId);
    private static readonly DateTime MaxDate = new(9999, 12, 31);
}
