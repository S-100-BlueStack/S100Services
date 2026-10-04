SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.ProductExportTrackFreezeHold', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductExportTrackFreezeHold (
        product_export_track_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductExportTrackFreezeHold PRIMARY KEY,
        frozen_at_utc datetime2(7) NOT NULL,
        frozen_by nvarchar(256) NULL,
        CONSTRAINT FK_ProductExportTrackFreezeHold_ProductExportTrack
            FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id)
    );
END;

-- Earlier builds represented a manual freeze by changing ProductExportTrack.state to Frozen.
-- Preserve that visible hold while restoring the latest workflow state underneath it.
;WITH LatestFrozen AS (
    SELECT
        t.product_export_track_id,
        h.occurred_at_utc AS frozen_at_utc,
        h.owner AS frozen_by,
        ROW_NUMBER() OVER (
            PARTITION BY t.product_export_track_id
            ORDER BY h.occurred_at_utc DESC, h.product_state_history_id DESC
        ) AS row_number
    FROM dbo.ProductExportTrack t
    INNER JOIN dbo.ProductStateHistory h
        ON h.product_export_track_id = t.product_export_track_id
       AND h.state = 5
    WHERE t.state = 5
)
INSERT INTO dbo.ProductExportTrackFreezeHold
    (product_export_track_id, frozen_at_utc, frozen_by)
SELECT product_export_track_id, frozen_at_utc, frozen_by
FROM LatestFrozen source
WHERE source.row_number = 1
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.ProductExportTrackFreezeHold target
      WHERE target.product_export_track_id = source.product_export_track_id
  );

;WITH PreviousState AS (
    SELECT
        t.product_export_track_id,
        COALESCE(previous_state.state, 1) AS underlying_state,
        ROW_NUMBER() OVER (
            PARTITION BY t.product_export_track_id
            ORDER BY frozen_state.occurred_at_utc DESC, frozen_state.product_state_history_id DESC
        ) AS row_number
    FROM dbo.ProductExportTrack t
    INNER JOIN dbo.ProductStateHistory frozen_state
        ON frozen_state.product_export_track_id = t.product_export_track_id
       AND frozen_state.state = 5
    OUTER APPLY (
        SELECT TOP 1 h.state
        FROM dbo.ProductStateHistory h
        WHERE h.product_export_track_id = t.product_export_track_id
          AND (h.occurred_at_utc < frozen_state.occurred_at_utc
               OR (h.occurred_at_utc = frozen_state.occurred_at_utc
                   AND h.product_state_history_id < frozen_state.product_state_history_id))
        ORDER BY h.occurred_at_utc DESC, h.product_state_history_id DESC
    ) previous_state
    WHERE t.state = 5
)
UPDATE track
SET state = previous.underlying_state,
    updated_at_utc = COALESCE(hold.frozen_at_utc, track.updated_at_utc)
FROM dbo.ProductExportTrack track
INNER JOIN PreviousState previous
    ON previous.product_export_track_id = track.product_export_track_id
   AND previous.row_number = 1
INNER JOIN dbo.ProductExportTrackFreezeHold hold
    ON hold.product_export_track_id = track.product_export_track_id
WHERE track.state = 5;

COMMIT TRANSACTION;
