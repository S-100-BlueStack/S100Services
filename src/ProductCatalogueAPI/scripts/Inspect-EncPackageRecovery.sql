-- Read-only inspection of one ENC source's current package, replay and Product tracks.
-- Run against the Product Catalogue System database, not S-128 or Hangfire.
-- Resolve the mapped S-57 dataset name from S-128 before populating that optional field.
DECLARE @SourceDatasetName nvarchar(64) = N'101DK005RONNE';
DECLARE @S57DatasetName nvarchar(64) = NULL;

SELECT p.package_id, p.source_dataset_name, p.s57_dataset_name,
       p.scan_from_utc, p.detected_at_utc,
       p.s101_discarded, p.s57_discarded, p.error_message,
       c.is_paused, c.updated_at_utc AS pause_updated_at_utc
FROM dbo.EncPackage p
LEFT JOIN dbo.EncPackageControl c ON c.source_dataset_name = p.source_dataset_name
WHERE p.source_dataset_name = @SourceDatasetName;

SELECT source_dataset_name, scan_from_utc
FROM dbo.EncPackageReplay
WHERE source_dataset_name = @SourceDatasetName;

SELECT product.dataset_name, track.product_specification, track.product_export_track_id,
       track.state, track.published_edition, track.published_update,
       track.candidate_edition, track.candidate_update, track.candidate_previous_state,
       track.updated_at_utc,
       CONVERT(bit, CASE WHEN hold.product_export_track_id IS NULL THEN 0 ELSE 1 END) AS is_manually_frozen,
       history.error_code AS latest_error_code, history.error_message AS latest_error_message,
       history.occurred_at_utc AS latest_state_at_utc
FROM dbo.Product product
INNER JOIN dbo.ProductExportTrack track ON track.product_id = product.product_id
LEFT JOIN dbo.ProductExportTrackFreezeHold hold ON hold.product_export_track_id = track.product_export_track_id
OUTER APPLY (
    SELECT TOP (1) h.error_code, h.error_message, h.occurred_at_utc
    FROM dbo.ProductStateHistory h
    WHERE h.product_export_track_id = track.product_export_track_id
    ORDER BY h.occurred_at_utc DESC, h.product_state_history_id DESC
) history
WHERE (product.dataset_name = @SourceDatasetName AND track.product_specification = 'S101')
   OR (@S57DatasetName IS NOT NULL AND product.dataset_name = @S57DatasetName
       AND track.product_specification = 'S57');

-- Reservations are deliberately not filtered by delivery status: an uncertain
-- or historical attempt may still make a candidate unsafe to discard.
SELECT product.dataset_name, track.product_specification, delivery.delivery_id,
       delivery.status, delivery.reserved_at_utc, delivery.completed_at_utc,
       revision.edition_number, revision.update_number
FROM dbo.Product product
INNER JOIN dbo.ProductExportTrack track ON track.product_id = product.product_id
INNER JOIN dbo.ProductIcEncDelivery delivery ON delivery.product_export_track_id = track.product_export_track_id
INNER JOIN dbo.ProductRevision revision ON revision.product_revision_id = delivery.product_revision_id
WHERE (product.dataset_name = @SourceDatasetName AND track.product_specification = 'S101')
   OR (@S57DatasetName IS NOT NULL AND product.dataset_name = @S57DatasetName
       AND track.product_specification = 'S57')
ORDER BY delivery.reserved_at_utc DESC;
