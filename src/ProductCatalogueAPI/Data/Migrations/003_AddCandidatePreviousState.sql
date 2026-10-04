SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.ProductExportTrack', N'candidate_previous_state') IS NULL
BEGIN
    ALTER TABLE dbo.ProductExportTrack
        ADD candidate_previous_state int NULL;
END;

-- SQL Server compiles a static batch before executing ALTER TABLE. Run the backfill
-- as dynamic SQL so the newly added column is resolved after the ALTER TABLE above.
EXEC sys.sp_executesql N'
-- Backfill candidates created before this column existed. The first Exporting history
-- row for the candidate identifies the transition; the preceding state is the state
-- that cancellation must restore. Idle is the safe fallback for incomplete legacy history.
;WITH CandidateStarts AS (
    SELECT
        t.product_export_track_id,
        t.candidate_edition,
        t.candidate_update,
        start_history.occurred_at_utc AS started_at_utc,
        start_history.product_state_history_id AS started_history_id,
        ROW_NUMBER() OVER (
            PARTITION BY t.product_export_track_id
            ORDER BY start_history.occurred_at_utc ASC, start_history.product_state_history_id ASC
        ) AS row_number
    FROM dbo.ProductExportTrack t
    OUTER APPLY (
        SELECT TOP (1)
            h.occurred_at_utc,
            h.product_state_history_id
        FROM dbo.ProductStateHistory h
        WHERE h.product_export_track_id = t.product_export_track_id
          AND h.state = 9
          AND h.edition_number = t.candidate_edition
          AND h.update_number = t.candidate_update
        ORDER BY h.occurred_at_utc ASC, h.product_state_history_id ASC
    ) start_history
    WHERE t.candidate_edition IS NOT NULL
      AND t.candidate_update IS NOT NULL
      AND t.candidate_previous_state IS NULL
), PreviousStates AS (
    SELECT
        starts.product_export_track_id,
        COALESCE(previous_history.state, 1) AS previous_state
    FROM CandidateStarts starts
    OUTER APPLY (
        SELECT TOP (1) h.state
        FROM dbo.ProductStateHistory h
        WHERE starts.row_number = 1
          AND h.product_export_track_id = starts.product_export_track_id
          AND (
                h.occurred_at_utc < starts.started_at_utc
                OR (h.occurred_at_utc = starts.started_at_utc AND h.product_state_history_id < starts.started_history_id)
              )
        ORDER BY h.occurred_at_utc DESC, h.product_state_history_id DESC
    ) previous_history
)
UPDATE track
SET candidate_previous_state = previous_states.previous_state
FROM dbo.ProductExportTrack track
INNER JOIN PreviousStates previous_states
    ON previous_states.product_export_track_id = track.product_export_track_id
WHERE track.candidate_edition IS NOT NULL
  AND track.candidate_update IS NOT NULL
  AND track.candidate_previous_state IS NULL;
';

COMMIT TRANSACTION;
