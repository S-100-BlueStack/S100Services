using System.Security.Cryptography;
using Dapper;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Data.Repositories;

public interface IProductIcEncDeliveryHistoryRepository
{
    Task<ProductIcEncDeliveryHistoryResponse> GetAsync(string datasetName, string specification,
        Func<Guid, string> downloadUrl, CancellationToken cancellationToken);
}

/// <summary>Reads historical deliveries for the configured workflow and their report metadata for a single catalogue delivery.</summary>
public sealed class ProductIcEncDeliveryHistoryRepository(
    DbConnectionFactory connectionFactory, ILogger<ProductIcEncDeliveryHistoryRepository> logger,
    IOptionsMonitor<SendToIcEncOptions> sendOptions, IOptions<ValidationEmailOptions> emailOptions)
    : IProductIcEncDeliveryHistoryRepository
{
    private const int AttemptLimit = 50;
    private const int ReportLimit = 20;
    private const int TimeoutSeconds = 10;
    private static readonly string SimulationMailboxKey =
        Convert.ToHexString(SHA256.HashData("ProductCatalogue.ICENC.Simulation"u8));

    public async Task<ProductIcEncDeliveryHistoryResponse> GetAsync(string datasetName, string specification,
        Func<Guid, string> downloadUrl, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        // Resolve the existing bound options once so both commands select the same persisted scope.
        var sendMode = sendOptions.CurrentValue.Mode;
        var emailMode = emailOptions.Value.Mode;
        if (!Enum.IsDefined(sendMode) || !Enum.IsDefined(emailMode))
            return ProductIcEncDeliveryHistoryResponse.Unavailable(datasetName, specification);

        var isSimulation = sendMode == SendToIcEncMode.Simulation && emailMode == ValidationEmailMode.Simulation;
        var dataset = new DbString { Value = datasetName, Length = 64 };
        var productSpecification = new DbString { Value = specification, IsAnsi = true, Length = 8 };
        using var connection = connectionFactory.Create();
        var rows = (await connection.QueryAsync<DeliveryRow>(new CommandDefinition(DeliverySql, new
        {
            Dataset = dataset,
            Specification = productSpecification,
            IsSimulation = isSimulation,
            Limit = AttemptLimit + 1
        }, commandTimeout: TimeoutSeconds, cancellationToken: cancellationToken))).ToArray();

        cancellationToken.ThrowIfCancellationRequested();
        if (rows.Length == 0 || rows.Any(row => row.TrackId != rows[0].TrackId ||
            (row.DeliveryId.HasValue && !IsCoherent(row))))
            return ProductIcEncDeliveryHistoryResponse.Unavailable(datasetName, specification);

        var selected = rows.Where(row => row.DeliveryId.HasValue).Take(AttemptLimit).ToArray();
        var reports = Array.Empty<ReportRow>();
        var reportsAvailable = true;
        if (selected.Length > 0)
        {
            try
            {
                reports = (await connection.QueryAsync<ReportRow>(new CommandDefinition(ReportSql, new
                {
                    TrackId = rows[0].TrackId,
                    Dataset = dataset,
                    Specification = productSpecification,
                    IsSimulation = isSimulation,
                    DeliveryIds = selected.Select(row => row.DeliveryId!.Value).ToArray(),
                    SimulationMailboxKey,
                    Limit = ReportLimit + 1
                }, commandTimeout: TimeoutSeconds, cancellationToken: cancellationToken))).ToArray();
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                cancellationToken.ThrowIfCancellationRequested();
                logger.LogWarning("IC-ENC History report metadata could not be loaded ({FailureType}).", error.GetType().Name);
                reportsAvailable = false;
            }
        }

        cancellationToken.ThrowIfCancellationRequested();
        var reportsByDelivery = reports.ToLookup(row => row.DeliveryId);
        var items = selected.Select(delivery => ToItem(delivery, reportsByDelivery[delivery.DeliveryId!.Value],
            reportsAvailable, isSimulation, downloadUrl)).ToArray();
        return new(datasetName, specification, "Available", rows.Length > AttemptLimit, items);
    }

    private static bool IsCoherent(DeliveryRow row) =>
        row.TrackId != Guid.Empty && row.DeliveryId != Guid.Empty && row.RevisionId is not null &&
        row.RevisionId != Guid.Empty && row.Edition >= 0 && row.Update >= 0 && row.ReservedAtUtc.HasValue &&
        row.Status is "Sending" or "Delivered" or "Uncertain" or "NotDelivered" or "Accepted" or "Rejected";

    private static ProductIcEncDeliveryHistoryItem ToItem(DeliveryRow delivery, IEnumerable<ReportRow> rows,
        bool reportsAvailable, bool isSimulation, Func<Guid, string> downloadUrl)
    {
        var decision = delivery.Status is "Accepted" or "Rejected"
            ? new ProductIcEncDeliveryDecision(delivery.Status,
                delivery.DecisionSource is "Email" or "Manual" or "Simulation" ? delivery.DecisionSource : null,
                Utc(delivery.DecisionAtUtc))
            : null;
        var fromEmail = !isSimulation && decision?.Source == "Email" &&
            delivery.SourceEventId?.Length == 36 &&
            Guid.TryParseExact(delivery.SourceEventId, "D", out var sourceId) && sourceId != Guid.Empty
            ? sourceId : (Guid?)null;
        var candidates = rows.ToArray();
        var valid = candidates.Where(row => row.ArtifactId.HasValue && row.RevisionId == delivery.RevisionId).ToArray();
        var reports = valid.Take(ReportLimit).Select(row => new ProductIcEncDeliveryReport(
            row.ArtifactId!.Value, row.FileName!, Utc(row.StoredAtUtc)!.Value, downloadUrl(row.ArtifactId.Value),
            fromEmail.HasValue && fromEmail == row.InboundId && row.MatchDeliveryId == delivery.DeliveryId &&
            row.MatchRevisionId == delivery.RevisionId)).ToArray();
        var availability = !reportsAvailable ? "Unavailable"
            : candidates.Length != valid.Length || candidates.Any(row => row.HasSuppressed) || valid.Length > ReportLimit ? "Partial" : "Available";

        return new(delivery.DeliveryId!.Value, delivery.Edition!.Value, delivery.Update!.Value,
            Utc(delivery.ReservedAtUtc)!.Value, Utc(delivery.CompletedAtUtc),
            decision is null ? delivery.Status : null, decision, availability, reports);
    }

    private static DateTime? Utc(DateTime? value) =>
        value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null;

    // OUTER APPLY distinguishes a known track with no attempts in scope from an unproven owner.
    // A bad revision tuple must remain visible to validation and cannot disappear in an inner join.
    private const string DeliverySql = """
        SELECT t.product_export_track_id AS TrackId, d.delivery_id AS DeliveryId,
            r.product_revision_id AS RevisionId, r.edition_number AS Edition, r.update_number AS [Update],
            d.status AS Status, d.reserved_at_utc AS ReservedAtUtc, d.completed_at_utc AS CompletedAtUtc,
            d.acknowledgement_source AS DecisionSource, d.acknowledged_at_utc AS DecisionAtUtc,
            d.source_event_id AS SourceEventId
        FROM dbo.Product p
        JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id
        OUTER APPLY (
            SELECT TOP (@Limit) d.delivery_id, d.product_revision_id, d.status, d.reserved_at_utc,
                d.completed_at_utc, d.acknowledgement_source, d.acknowledged_at_utc, d.source_event_id
            FROM dbo.ProductIcEncDelivery d
            WHERE d.product_export_track_id = t.product_export_track_id AND d.is_simulation = @IsSimulation
                AND (d.acknowledgement_source IS NULL
                    OR (@IsSimulation = 0 AND UPPER(LTRIM(d.acknowledgement_source)) <> 'SIMULATION')
                    OR (@IsSimulation = 1 AND CONVERT(varbinary(16), d.acknowledgement_source)
                        = CONVERT(varbinary(16), 'Simulation')))
            ORDER BY d.reserved_at_utc DESC, d.delivery_id DESC
        ) d
        LEFT JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
            AND r.product_export_track_id = t.product_export_track_id
        WHERE p.dataset_name = @Dataset AND t.product_specification = @Specification
            AND CONVERT(varbinary(128), UPPER(p.dataset_name)) = CONVERT(varbinary(128), UPPER(@Dataset))
            AND CONVERT(varbinary(8), t.product_specification) = CONVERT(varbinary(8), @Specification)
        ORDER BY d.reserved_at_utc DESC, d.delivery_id DESC;
        """;

    // OPENJSON receives a safe value even if the optimizer evaluates it before surrounding filters.
    // The reserved key suffix makes spelling and trailing spaces distinct under SQL string comparison.
    // Bind by selected delivery before testing revision equality so attributable invalid rows count as Partial.
    // Selected IDs are matched even in duplicate-key metadata so those rows can also count as Partial.
    private const string ReportSql = """
        WITH Bound AS (
            SELECT a.product_artifact_id AS ArtifactId, a.file_name AS FileName, a.created_at_utc AS StoredAtUtc, a.product_revision_id AS RevisionId,
                delivery.delivery_id AS DeliveryId, receipt.inbound_id AS InboundId,
                receipt.delivery_id AS MatchDeliveryId, receipt.revision_id AS MatchRevisionId,
                CASE WHEN meta.SourceCount = 1 AND meta.InboundCount = 1 AND meta.DeliveryCount = 1
                    AND meta.ValidSource = 1 AND meta.InboundGuid IS NOT NULL
                    AND delivery.product_revision_id = a.product_revision_id
                    AND a.product_artifact_id <> '00000000-0000-0000-0000-000000000000'
                    AND NULLIF(LTRIM(RTRIM(a.file_name)), '') IS NOT NULL
                    AND mode.KeyCount = 1
                    AND ((@IsSimulation = 0 AND UPPER(receipt.mailbox_key) <> @SimulationMailboxKey
                            AND mode.Live = 1 AND mode.LiveContradictions = 0)
                        OR (@IsSimulation = 1 AND UPPER(receipt.mailbox_key) = @SimulationMailboxKey
                            AND mode.Simulated = 1 AND mode.WorkflowKeys = 1 AND mode.Workflow = 1
                            AND mode.OutgoingKeys = 1 AND outgoing.KeyCount = 8 AND outgoing.DistinctKeys = 8
                            AND outgoing.IsSimulated = 1
                            AND outgoing.DeliveryId COLLATE Latin1_General_100_BIN2 = LOWER(CONVERT(nvarchar(36), delivery.delivery_id))
                            AND outgoing.TrackId COLLATE Latin1_General_100_BIN2 = LOWER(CONVERT(nvarchar(36), delivery.product_export_track_id))
                            AND outgoing.RevisionId COLLATE Latin1_General_100_BIN2 = LOWER(CONVERT(nvarchar(36), revision.product_revision_id))
                            AND outgoing.Dataset + N':' COLLATE Latin1_General_100_BIN2 = UPPER(@Dataset) + N':'
                            AND outgoing.Specification + N':' COLLATE Latin1_General_100_BIN2 = @Specification + N':'
                            AND outgoing.Edition = CONVERT(nvarchar(12), revision.edition_number)
                            AND outgoing.[Update] = CONVERT(nvarchar(12), revision.update_number)))
                    THEN 1 ELSE 0 END AS Valid
            FROM dbo.ProductArtifact a
            CROSS APPLY (SELECT CASE WHEN ISJSON(a.metadata_json) = 1 THEN a.metadata_json ELSE N'{}' END AS JsonValue) safe
            CROSS APPLY (
                SELECT COUNT(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'Source:' THEN 1 END) AS SourceCount,
                    COUNT(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'InboundId:' THEN 1 END) AS InboundCount,
                    COUNT(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'DeliveryId:' THEN 1 END) AS DeliveryCount,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'Source:'
                        AND [type] = 1 AND [value] + N':' COLLATE Latin1_General_100_BIN2 = N'IC-ENC:' THEN 1 ELSE 0 END) AS ValidSource,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'InboundId:'
                        AND [type] = 1 AND DATALENGTH([value]) = 72 THEN CONVERT(nvarchar(36), [value]) END) AS InboundGuid
                FROM OPENJSON(safe.JsonValue)
                WHERE [key] + N':' COLLATE Latin1_General_100_BIN2 IN (N'Source:', N'InboundId:', N'DeliveryId:')
            ) meta
            CROSS APPLY (
                SELECT DISTINCT parsed.DeliveryId
                FROM OPENJSON(safe.JsonValue)
                CROSS APPLY (SELECT TRY_CONVERT(uniqueidentifier, CONVERT(nvarchar(36), [value])) AS DeliveryId) parsed
                WHERE [key] + N':' COLLATE Latin1_General_100_BIN2 = N'DeliveryId:' AND [type] = 1
                    AND CONVERT(varbinary(max), LOWER([value])) =
                        CONVERT(varbinary(72), LOWER(CONVERT(nvarchar(36), parsed.DeliveryId)))
            ) binding
            JOIN dbo.ProductIcEncDelivery delivery ON delivery.delivery_id = binding.DeliveryId
                AND delivery.product_export_track_id = a.product_export_track_id
                AND delivery.is_simulation = @IsSimulation
            LEFT JOIN dbo.ProductRevision revision ON revision.product_revision_id = delivery.product_revision_id
                AND revision.product_export_track_id = delivery.product_export_track_id
            LEFT JOIN dbo.IcEncInboundEmail receipt ON receipt.inbound_id = TRY_CONVERT(uniqueidentifier, meta.InboundGuid)
                AND receipt.inbound_id <> '00000000-0000-0000-0000-000000000000'
                AND CONVERT(varbinary(72), LOWER(meta.InboundGuid)) =
                    CONVERT(varbinary(72), LOWER(CONVERT(nvarchar(36), receipt.inbound_id)))
            CROSS APPLY (
                SELECT COUNT(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'IsSimulation:' THEN 1 END) AS KeyCount,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'IsSimulation:'
                        AND [type] = 3 AND [value] = N'false' THEN 1 ELSE 0 END) AS Live,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'IsSimulation:'
                        AND [type] = 3 AND [value] = N'true' THEN 1 ELSE 0 END) AS Simulated,
                    COUNT(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'SimulationWorkflow:' THEN 1 END) AS WorkflowKeys,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'SimulationWorkflow:'
                        AND [type] = 3 AND [value] = N'true' THEN 1 ELSE 0 END) AS Workflow,
                    COUNT(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'SimulatedOutgoingFile:' THEN 1 END) AS OutgoingKeys,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'SimulatedOutgoingFile:'
                        AND [type] = 5 THEN [value] END) AS OutgoingObject,
                    COUNT(CASE WHEN ([key] + N':' COLLATE Latin1_General_100_BIN2 = N'SimulationWorkflow:'
                            AND NOT ([type] = 3 AND [value] = N'false'))
                        OR ([key] + N':' COLLATE Latin1_General_100_BIN2 = N'SimulatedOutgoingFile:' AND [type] <> 0)
                        THEN 1 END) AS LiveContradictions
                FROM OPENJSON(CASE WHEN ISJSON(receipt.message_json) = 1 THEN receipt.message_json ELSE N'{}' END)
            ) mode
            CROSS APPLY (
                SELECT COUNT(*) AS KeyCount, COUNT(DISTINCT [key]) AS DistinctKeys,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'IsSimulation:'
                        AND [type] = 3 AND [value] = N'true' THEN 1 ELSE 0 END) AS IsSimulated,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'DeliveryId:'
                        AND [type] = 1 AND DATALENGTH([value]) = 72 THEN LOWER([value]) END) AS DeliveryId,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'TrackId:'
                        AND [type] = 1 AND DATALENGTH([value]) = 72 THEN LOWER([value]) END) AS TrackId,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'RevisionId:'
                        AND [type] = 1 AND DATALENGTH([value]) = 72 THEN LOWER([value]) END) AS RevisionId,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'DatasetName:'
                        AND [type] = 1 THEN UPPER([value]) END) AS Dataset,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'Specification:'
                        AND [type] = 1 THEN [value] END) AS Specification,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'Edition:'
                        AND [type] = 2 THEN [value] END) AS Edition,
                    MAX(CASE WHEN [key] + N':' COLLATE Latin1_General_100_BIN2 = N'Update:'
                        AND [type] = 2 THEN [value] END) AS [Update]
                FROM OPENJSON(CASE WHEN @IsSimulation = 1 AND ISJSON(mode.OutgoingObject) = 1
                    THEN mode.OutgoingObject ELSE N'{}' END)
                WHERE [key] + N':' COLLATE Latin1_General_100_BIN2 IN
                    (N'IsSimulation:', N'DeliveryId:', N'TrackId:', N'RevisionId:', N'DatasetName:', N'Specification:', N'Edition:', N'Update:')
            ) outgoing
            WHERE a.product_export_track_id = @TrackId
                AND a.artifact_kind = 'IcEncReport'
                AND CONVERT(varbinary(32), a.artifact_kind) = CONVERT(varbinary(32), 'IcEncReport')
                AND binding.DeliveryId IN @DeliveryIds
        ), Ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY DeliveryId ORDER BY Valid DESC, StoredAtUtc DESC, ArtifactId DESC) AS Position,
                MAX(1 - Valid) OVER (PARTITION BY DeliveryId) AS Suppressed
            FROM Bound
        )
        SELECT DeliveryId, CONVERT(bit, Suppressed) AS HasSuppressed,
            CASE WHEN Valid = 1 THEN ArtifactId END AS ArtifactId,
            CASE WHEN Valid = 1 THEN FileName END AS FileName,
            CASE WHEN Valid = 1 THEN StoredAtUtc END AS StoredAtUtc,
            CASE WHEN Valid = 1 THEN RevisionId END AS RevisionId,
            CASE WHEN Valid = 1 THEN InboundId END AS InboundId,
            CASE WHEN Valid = 1 THEN MatchDeliveryId END AS MatchDeliveryId,
            CASE WHEN Valid = 1 THEN MatchRevisionId END AS MatchRevisionId
        FROM Ranked
        WHERE Position = 1 OR (Valid = 1 AND Position <= @Limit)
        ORDER BY DeliveryId, Position;
        """;

    private sealed class DeliveryRow
    {
        public Guid TrackId { get; init; }
        public Guid? DeliveryId { get; init; }
        public Guid? RevisionId { get; init; }
        public int? Edition { get; init; }
        public int? Update { get; init; }
        public string? Status { get; init; }
        public DateTime? ReservedAtUtc { get; init; }
        public DateTime? CompletedAtUtc { get; init; }
        public string? DecisionSource { get; init; }
        public DateTime? DecisionAtUtc { get; init; }
        public string? SourceEventId { get; init; }
    }

    private sealed class ReportRow
    {
        public Guid DeliveryId { get; init; }
        public bool HasSuppressed { get; init; }
        public Guid? ArtifactId { get; init; }
        public string? FileName { get; init; }
        public DateTime? StoredAtUtc { get; init; }
        public Guid? RevisionId { get; init; }
        public Guid? InboundId { get; init; }
        public Guid? MatchDeliveryId { get; init; }
        public Guid? MatchRevisionId { get; init; }
    }
}
