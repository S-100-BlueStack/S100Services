using Dapper;
using ProductCatalogueAPI.Data.Database;
using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Durable mailbox cursor, inbound audit and original report storage in the System database.</summary>
public sealed class ValidationEmailRepository(DbConnectionFactory connections, TimeProvider clock, IValidationEmailParser parser) : IValidationEmailStore, IValidationMailboxSyncStore, IValidationEmailSimulationStore
{
    private static readonly string SimulationMailboxKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("ProductCatalogue.ICENC.Simulation")));
    /// <summary>Operator-visible audit projection; raw mailbox bodies remain behind a separate detail action.</summary>
    public sealed class InboundRow
    {
        /// <summary>Stable inbound identifier.</summary>
        public Guid Id { get; set; }
        /// <summary>Processing state.</summary>
        public string Status { get; set; } = "";
        /// <summary>Received UTC timestamp.</summary>
        public DateTimeOffset ReceivedAt { get; set; }
        /// <summary>Structured classification and matching evidence.</summary>
        public string? ResultJson { get; set; }
        /// <summary>Last reviewed association and operator identity.</summary>
        public string? ReviewJson { get; set; }
        /// <summary>Last infrastructure failure category, without exception text.</summary>
        public string? ErrorCode { get; set; }
        /// <summary>True for permanently synthetic evidence; independent of the currently configured mode.</summary>
        public bool IsSimulation { get; set; }
    }

    /// <summary>Initializes the durable lookback only once for a mailbox/folder configuration.</summary>
    public async Task<ValidationMailboxSyncState> GetSyncAsync(string key, int lookbackDays, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        return await connection.QuerySingleAsync<ValidationMailboxSyncState>(new CommandDefinition("""
            IF NOT EXISTS (SELECT 1 FROM dbo.IcEncMailboxSync WITH (UPDLOCK, HOLDLOCK) WHERE mailbox_key = @Key)
                INSERT dbo.IcEncMailboxSync (mailbox_key, initial_from_utc, next_poll_at_utc, updated_at_utc)
                VALUES (@Key, @Initial, @Now, @Now);
            SELECT initial_from_utc AS InitialFromUtc, cursor_url AS Cursor, next_poll_at_utc AS NextPollAtUtc
            FROM dbo.IcEncMailboxSync WHERE mailbox_key = @Key;
            """, new { Key = key, Initial = clock.GetUtcNow().AddDays(-lookbackDays), Now = clock.GetUtcNow().UtcDateTime }, cancellationToken: cancellationToken));
    }

    /// <summary>Advances only after each page's relevant messages have been durably inserted.</summary>
    public async Task SaveCursorAsync(string key, string? cursor, int delayMinutes, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.IcEncMailboxSync SET cursor_url = @Cursor, next_poll_at_utc = @Next, updated_at_utc = @Now
            WHERE mailbox_key = @Key;
            """, new { Key = key, Cursor = cursor, Now = clock.GetUtcNow().UtcDateTime, Next = clock.GetUtcNow().AddMinutes(delayMinutes).UtcDateTime }, cancellationToken: cancellationToken));
    }

    /// <summary>Inserts immutable original evidence; repeated transport IDs never overwrite earlier evidence.</summary>
    public async Task InsertAsync(string mailboxKey, ValidationEmailMessage message, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition("""
            INSERT dbo.IcEncInboundEmail (inbound_id, mailbox_key, transport_id_hash, received_at_utc, message_json, next_attempt_at_utc, created_at_utc, updated_at_utc)
            SELECT @Id, @Key, @Hash, @ReceivedAt, @Json, @Now, @Now, @Now
            WHERE NOT EXISTS (SELECT 1 FROM dbo.IcEncInboundEmail WITH (UPDLOCK, HOLDLOCK) WHERE mailbox_key = @Key AND transport_id_hash = @Hash);
            """, new { Id = Guid.NewGuid(), Key = mailboxKey, Hash = SHA256.HashData(Encoding.UTF8.GetBytes(message.Id)), message.ReceivedAt, Json = JsonSerializer.Serialize(message), Now = clock.GetUtcNow().UtcDateTime }, cancellationToken: cancellationToken));
    }

    /// <summary>Returns a bounded retry batch; no read/unread mailbox state is consulted.</summary>
    public async Task<Guid[]> PendingAsync(bool isSimulation, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        return (await connection.QueryAsync<Guid>(new CommandDefinition("SELECT TOP (100) inbound_id FROM dbo.IcEncInboundEmail WHERE status = 'Pending' AND next_attempt_at_utc <= @Now AND COALESCE(JSON_VALUE(message_json, '$.IsSimulation'), 'false') = @Simulation ORDER BY received_at_utc, inbound_id;", new { Now = clock.GetUtcNow().UtcDateTime, Simulation = isSimulation ? "true" : "false" }, cancellationToken: cancellationToken))).ToArray();
    }

    /// <summary>Loads original evidence for retry or authenticated inspection.</summary>
    public async Task<ValidationEmailMessage?> GetMessageAsync(Guid id, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        var json = await connection.QuerySingleOrDefaultAsync<string>(new CommandDefinition("SELECT message_json FROM dbo.IcEncInboundEmail WHERE inbound_id = @Id;", new { Id = id }, cancellationToken: cancellationToken));
        return json is null ? null : JsonSerializer.Deserialize<ValidationEmailMessage>(json);
    }

    /// <summary>Restores an explicit reviewed association only for an interrupted application of that exact association.</summary>
    public async Task<ValidationEmailReview?> GetPendingReviewAsync(Guid id, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        var row = await connection.QuerySingleOrDefaultAsync<InboundRow>(new CommandDefinition("SELECT result_json AS ResultJson, review_json AS ReviewJson FROM dbo.IcEncInboundEmail WHERE inbound_id = @Id AND status = 'Pending';", new { Id = id }, cancellationToken: cancellationToken));
        if (row?.ResultJson is null || row.ReviewJson is null) return null;
        var result = JsonSerializer.Deserialize<ValidationEmailProcessingResult>(row.ResultJson);
        var reviews = JsonSerializer.Deserialize<ValidationEmailReview[]>(row.ReviewJson);
        var review = reviews?.LastOrDefault();
        return result?.Status == "Pending" && result.Reason.StartsWith("APPLYING_", StringComparison.Ordinal) && result.Match?.DeliveryId == review?.DeliveryId ? review : null;
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyList<ValidationOutgoingFile>> FindOutgoingAsync(string fileName, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        return (await connection.QueryAsync<ValidationOutgoingFile>(new CommandDefinition("""
            SELECT d.delivery_id AS DeliveryId, d.product_revision_id AS RevisionId, d.product_export_track_id AS TrackId,
                p.dataset_name AS DatasetName, t.product_specification AS Specification, r.edition_number AS Edition,
                r.update_number AS [Update], COALESCE(f.file_name, @FileName) AS FileName, f.crc AS Crc, d.reserved_at_utc AS SentAtUtc, d.status AS Status,
                CONVERT(bit, CASE WHEN f.delivery_id IS NULL THEN 0 ELSE 1 END) AS HasManifest, d.is_simulation AS IsSimulation
            FROM dbo.ProductIcEncDelivery d
            JOIN dbo.ProductExportTrack t ON t.product_export_track_id = d.product_export_track_id
            JOIN dbo.Product p ON p.product_id = t.product_id
            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
            LEFT JOIN dbo.ProductIcEncDeliveryFile f ON f.delivery_id = d.delivery_id AND f.file_name = @FileName
            WHERE f.file_name = @FileName OR
                (NOT EXISTS (SELECT 1 FROM dbo.ProductIcEncDeliveryFile known WHERE known.delivery_id = d.delivery_id)
                 AND p.dataset_name = @DatasetName AND r.update_number = @Update AND d.status <> 'NotDelivered');
            """, new { FileName = fileName, DatasetName = fileName[..^4], Update = int.Parse(fileName[^3..], System.Globalization.CultureInfo.InvariantCulture) }, cancellationToken: cancellationToken))).ToArray();
    }

    /// <inheritdoc/>
    public async Task SaveResultAsync(Guid id, ValidationEmailProcessingResult result, IReadOnlyList<ValidationEmailAttachment> attachments, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.IcEncInboundEmail SET result_json = @Json, status = @Status, delivery_id = @DeliveryId,
                revision_id = @RevisionId, updated_at_utc = @Now, last_error_code = NULL
            WHERE inbound_id = @Id;
            """, new { Id = id, Json = JsonSerializer.Serialize(result), result.Status, DeliveryId = result.IsSimulation && result.Match?.IsSimulation != true ? null : result.Match?.DeliveryId, RevisionId = result.Match?.RevisionId, Now = clock.GetUtcNow().UtcDateTime }, transaction, cancellationToken: cancellationToken));
        if (result.Match is not null && (!result.IsSimulation || result.Match.IsSimulation) && result.Parsed.CanMatch && result.Status != "DryRun") {
            foreach (var attachment in attachments.Where(a => parser.IsRelevantAttachment(a.Name))) {
                var hash = SHA256.HashData(attachment.Content);
                var artifactId = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"{id:D}:{attachment.Name}:{Convert.ToHexString(hash)}"))[..16]);
                await connection.ExecuteAsync(new CommandDefinition("""
                    IF NOT EXISTS (SELECT 1 FROM dbo.ProductArtifact WITH (UPDLOCK, HOLDLOCK) WHERE product_artifact_id = @ArtifactId)
                        INSERT dbo.ProductArtifact (product_artifact_id, product_export_track_id, product_revision_id, artifact_kind, file_name, media_type, content, sha256, metadata_json, created_at_utc)
                        VALUES (@ArtifactId, @TrackId, @RevisionId, 'ValidationReport', @Name, 'application/octet-stream', @Content, @Hash, @Metadata, @Now);
                    """, new { ArtifactId = artifactId, result.Match.TrackId, result.Match.RevisionId, attachment.Name, attachment.Content, Hash = hash,
                    Metadata = JsonSerializer.Serialize(new { Source = parser.ProviderName, InboundId = id, result.Match.DeliveryId }), Now = clock.GetUtcNow().UtcDateTime }, transaction, cancellationToken: cancellationToken));
            }
        }
        transaction.Commit();
    }

    /// <summary>Persists retry delay without logging exception text or losing the original message.</summary>
    public async Task FailedAsync(Guid id, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition("UPDATE dbo.IcEncInboundEmail SET status = 'Pending', attempts = attempts + 1, next_attempt_at_utc = @Next, last_error_code = 'INFRASTRUCTURE_FAILURE', updated_at_utc = @Now WHERE inbound_id = @Id;", new { Id = id, Next = clock.GetUtcNow().AddMinutes(5).UtcDateTime, Now = clock.GetUtcNow().UtcDateTime }, cancellationToken: cancellationToken));
    }

    /// <summary>Lists bounded audit summaries, optionally filtered by exact delivery and processing state.</summary>
    public async Task<IReadOnlyList<InboundRow>> ListAsync(string? status, Guid? deliveryId, bool? isSimulation, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        return (await connection.QueryAsync<InboundRow>(new CommandDefinition("""
            SELECT TOP (100) inbound_id AS Id, status AS Status, received_at_utc AS ReceivedAt, result_json AS ResultJson,
                review_json AS ReviewJson, last_error_code AS ErrorCode,
                CONVERT(bit, CASE WHEN JSON_VALUE(message_json, '$.IsSimulation') = 'true' THEN 1 ELSE 0 END) AS IsSimulation FROM dbo.IcEncInboundEmail
            WHERE (@Status IS NULL OR status = @Status) AND (@DeliveryId IS NULL OR delivery_id = @DeliveryId)
                AND (@Simulation IS NULL OR COALESCE(JSON_VALUE(message_json, '$.IsSimulation'), 'false') = @Simulation)
            ORDER BY received_at_utc DESC, inbound_id;
            """, new { Status = status, DeliveryId = deliveryId, Simulation = isSimulation.HasValue ? isSimulation.Value ? "true" : "false" : null }, cancellationToken: cancellationToken))).ToArray();
    }

    /// <inheritdoc/>
    public async Task<ValidationSimulationCandidate?> GetSimulationCandidateAsync(string datasetName, string? specification, int? edition, int? update, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        var candidates = (await connection.QueryAsync<ValidationSimulationCandidate>(new CommandDefinition("""
            SELECT r.product_revision_id AS RevisionId, t.product_export_track_id AS TrackId, p.dataset_name AS DatasetName,
                t.product_specification AS Specification, r.edition_number AS Edition, r.update_number AS [Update], a.content AS ExchangeSet
            FROM dbo.Product p JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id
            CROSS APPLY (SELECT TOP (1) revision.* FROM dbo.ProductRevision revision WHERE revision.product_export_track_id = t.product_export_track_id
                ORDER BY revision.created_at_utc DESC, revision.product_revision_id DESC) r
            CROSS APPLY (SELECT TOP (1) artifact.content FROM dbo.ProductArtifact artifact WHERE artifact.product_revision_id = r.product_revision_id AND artifact.artifact_kind = 'ExchangeSet'
                ORDER BY artifact.created_at_utc DESC, artifact.product_artifact_id DESC) a
            WHERE p.dataset_name = @DatasetName AND t.product_specification IN ('S57', 'S101')
                AND (@Specification IS NULL OR t.product_specification = @Specification)
                AND r.edition_number = t.candidate_edition AND r.update_number = t.candidate_update
                AND (@Edition IS NULL OR r.edition_number = @Edition) AND (@Update IS NULL OR r.update_number = @Update);
            """, new { DatasetName = datasetName, Specification = specification, Edition = edition, Update = update }, cancellationToken: cancellationToken))).ToArray();
        return candidates.Length == 1 ? candidates[0] : null;
    }

    /// <inheritdoc/>
    public async Task<ValidationEmailSimulationRecord?> FindSimulationAsync(string sourceKey, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        var row = await connection.QuerySingleOrDefaultAsync<SimulationRow>(new CommandDefinition("SELECT inbound_id AS Id, message_json AS MessageJson, status AS ProcessingStatus, last_error_code AS ErrorCode FROM dbo.IcEncInboundEmail WHERE mailbox_key = @Key AND transport_id_hash = @Hash;",
            new { Key = SimulationMailboxKey, Hash = SHA256.HashData(Encoding.UTF8.GetBytes(ValidationSimulationIdentity.MessageId(sourceKey))) }, cancellationToken: cancellationToken));
        return row is null ? null : new(row.Id, JsonSerializer.Deserialize<ValidationEmailMessage>(row.MessageJson)!) { ProcessingStatus = row.ProcessingStatus, ErrorCode = row.ErrorCode };
    }

    /// <inheritdoc/>
    public async Task<ValidationEmailSimulationRecord> SaveSimulationAsync(string sourceKey, ValidationEmailMessage message, CancellationToken cancellationToken) {
        if (!message.IsSimulation || message.Id != ValidationSimulationIdentity.MessageId(sourceKey)) throw new ArgumentException("Only marked synthetic evidence can enter simulation storage.", nameof(message));
        await InsertAsync(SimulationMailboxKey, message, cancellationToken);
        return await FindSimulationAsync(sourceKey, cancellationToken) ?? throw new InvalidOperationException("The simulated email was not durably captured.");
    }

    /// <summary>Exposes a failed generated workflow response on its exact still-current package, including failures on later polling ticks.</summary>
    /// <param name="message">Original synthetic message whose permanent transmission binding must still match.</param>
    /// <param name="cancellationToken">Cancels the guarded System DB update.</param>
    /// <returns>Completion without changing any candidate or external decision.</returns>
    public async Task RecordWorkflowProcessingFailureAsync(ValidationEmailMessage message, CancellationToken cancellationToken) {
        var outgoing = message.SimulatedOutgoingFile;
        if (!message.IsSimulation || !message.SimulationWorkflow || outgoing is null || !outgoing.IsSimulation) return;
        using var connection = await OpenAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE ep SET error_message = @Message
            FROM dbo.EncPackage ep
            JOIN dbo.Product p ON (@Specification = 'S101' AND p.dataset_name = ep.source_dataset_name)
                OR (@Specification = 'S57' AND p.dataset_name = ep.s57_dataset_name)
            JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id AND t.product_specification = @Specification AND t.product_export_track_id = @TrackId
            JOIN dbo.ProductIcEncDelivery d ON d.delivery_id = @DeliveryId AND d.product_export_track_id = t.product_export_track_id
                AND d.product_revision_id = @RevisionId AND d.is_simulation = 1 AND d.status = 'Delivered'
            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id AND r.product_export_track_id = t.product_export_track_id
            WHERE t.state = @InTransit AND t.candidate_edition = r.edition_number AND t.candidate_update = r.update_number
              AND r.product_revision_id = (SELECT TOP (1) product_revision_id FROM dbo.ProductRevision
                  WHERE product_export_track_id = t.product_export_track_id ORDER BY created_at_utc DESC, product_revision_id DESC);
            """, new { outgoing.Specification, outgoing.TrackId, outgoing.DeliveryId, outgoing.RevisionId,
                InTransit = ProductCatalogueAPI.Data.Models.ProductState.InTransit, Message = ProductCatalogueAPI.Services.Operations.EncPackageFailureRules.SendFailureMessage }, cancellationToken: cancellationToken));
    }

    private sealed class SimulationRow
    {
        public string? ProcessingStatus { get; set; }
        public string? ErrorCode { get; set; }
        public Guid Id { get; set; }
        public string MessageJson { get; set; } = "";
    }

    /// <summary>Audits an operator association before applying or previewing it.</summary>
    public async Task ReviewAsync(Guid id, ValidationEmailReview review, string owner, CancellationToken cancellationToken) {
        using var connection = await OpenAsync(cancellationToken);
        // Keep every prior operator review in an append-only JSON array.
        await connection.ExecuteAsync(new CommandDefinition("UPDATE dbo.IcEncInboundEmail SET review_json = JSON_MODIFY(COALESCE(review_json, '[]'), 'append $', JSON_QUERY(@Review)), updated_at_utc = @Now WHERE inbound_id = @Id;", new { Id = id, Review = JsonSerializer.Serialize(new { review.DeliveryId, review.Reason, Owner = owner, AtUtc = clock.GetUtcNow() }), Now = clock.GetUtcNow().UtcDateTime }, cancellationToken: cancellationToken));
    }

    private async Task<IDbConnection> OpenAsync(CancellationToken cancellationToken) {
        var connection = connections.Create();
        try {
            if (connection is DbConnection db) await db.OpenAsync(cancellationToken);
            else connection.Open();
            return connection;
        }
        catch { connection.Dispose(); throw; }
    }
}
