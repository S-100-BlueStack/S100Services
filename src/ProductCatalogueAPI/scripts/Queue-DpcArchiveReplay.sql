-- Run against the Product Catalogue SYSTEM database after deploying the clock fix.
-- Pause DPC while applying this script. It queues one AOI for its next normal run.
-- This is an operator recovery action, not a migration. The BAT does not run it.
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @SourceDatasetName nvarchar(64) = N'101DK004DEBCE';
-- The confirmed edit was 11:14:43 Copenhagen = 09:14:43 UTC on 7 October 2026.
-- Use an instant just BEFORE the earliest missed edit, not the scan's local log time.
DECLARE @SinceUtc datetime2(7) = '2026-10-07T09:14:42.0000000';
DECLARE @Apply bit = 0; -- Inspect the results first; change to 1 to queue this AOI.

SELECT TOP (5) id, job_name, last_successful_run_utc
FROM dbo.JobRunState
WHERE job_name = N'DetectProductChangesJob'
ORDER BY id DESC;
SELECT package_id, source_dataset_name, detected_at_utc, scan_from_utc, error_message
FROM dbo.EncPackage WHERE source_dataset_name = @SourceDatasetName;
SELECT p.dataset_name, t.product_specification, t.state, t.candidate_edition, t.candidate_update
FROM dbo.Product p JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id
WHERE p.dataset_name = @SourceDatasetName;
SELECT @SourceDatasetName AS ReplayDataset, @SinceUtc AS ReplaySinceUtc, @Apply AS ApplyReplay;

IF @Apply = 0 RETURN;
IF @SinceUtc >= SYSUTCDATETIME()
    THROW 50000, 'The replay boundary must be an earlier UTC instant.', 1;

BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK) WHERE source_dataset_name = @SourceDatasetName)
    THROW 50000, 'This recovery script is only for a missing package. Review the existing package first.', 1;
IF EXISTS (
    SELECT 1 FROM dbo.Product p
    JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id
    LEFT JOIN dbo.ProductExportTrackFreezeHold h ON h.product_export_track_id = t.product_export_track_id
    WHERE p.dataset_name = @SourceDatasetName
      AND (t.state <> 1 OR t.candidate_edition IS NOT NULL OR h.product_export_track_id IS NOT NULL)
)
    THROW 50000, 'The source track has a candidate, hold, or non-Idle state. Review it before requesting replay.', 1;
IF EXISTS (
    SELECT 1 FROM dbo.Product p
    JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id
    JOIN dbo.ProductStateHistory h ON h.product_export_track_id = t.product_export_track_id
    WHERE p.dataset_name = @SourceDatasetName AND h.state = 14 AND h.occurred_at_utc >= @SinceUtc
)
    THROW 50000, 'A candidate was discarded after this boundary. This script will not replay deliberately discarded work.', 1;

UPDATE dbo.EncPackageReplay WITH (UPDLOCK, HOLDLOCK)
SET scan_from_utc = CASE WHEN scan_from_utc < @SinceUtc THEN scan_from_utc ELSE @SinceUtc END
WHERE source_dataset_name = @SourceDatasetName;
IF @@ROWCOUNT = 0
    INSERT INTO dbo.EncPackageReplay (source_dataset_name, scan_from_utc)
    VALUES (@SourceDatasetName, @SinceUtc);
COMMIT TRANSACTION;
PRINT 'Queued one AOI for replay. JobRunState and all existing candidates were preserved.';
