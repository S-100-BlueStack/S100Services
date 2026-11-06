-- Apply after 006 to the Product Catalogue System database, not S-128 or Hangfire.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.ProductIcEncDelivery', 'acknowledged_at_utc') IS NULL
    ALTER TABLE dbo.ProductIcEncDelivery ADD acknowledged_at_utc datetime2(7) NULL;
IF COL_LENGTH('dbo.ProductIcEncDelivery', 'acknowledgement_source') IS NULL
    ALTER TABLE dbo.ProductIcEncDelivery ADD acknowledgement_source varchar(16) NULL;
IF COL_LENGTH('dbo.ProductIcEncDelivery', 'source_event_id') IS NULL
    ALTER TABLE dbo.ProductIcEncDelivery ADD source_event_id nvarchar(256) NULL;
IF COL_LENGTH('dbo.ProductIcEncDelivery', 'notice_reference') IS NULL
    ALTER TABLE dbo.ProductIcEncDelivery ADD notice_reference nvarchar(256) NULL;
IF COL_LENGTH('dbo.ProductIcEncDelivery', 'rejection_reason') IS NULL
    ALTER TABLE dbo.ProductIcEncDelivery ADD rejection_reason nvarchar(1000) NULL;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ProductIcEncDelivery_Status' AND parent_object_id = OBJECT_ID('dbo.ProductIcEncDelivery'))
    ALTER TABLE dbo.ProductIcEncDelivery DROP CONSTRAINT CK_ProductIcEncDelivery_Status;
ALTER TABLE dbo.ProductIcEncDelivery ADD CONSTRAINT CK_ProductIcEncDelivery_Status
    CHECK (status IN ('Sending', 'Delivered', 'Uncertain', 'NotDelivered', 'Accepted', 'Rejected'));

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ProductIcEncDelivery_AcknowledgementSource' AND parent_object_id = OBJECT_ID('dbo.ProductIcEncDelivery'))
    -- Compile after the columns are added, without splitting the transaction into GO batches.
    EXEC(N'ALTER TABLE dbo.ProductIcEncDelivery ADD CONSTRAINT CK_ProductIcEncDelivery_AcknowledgementSource
        CHECK (acknowledgement_source IS NULL OR acknowledgement_source IN (''Email'', ''Manual''))');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ProductIcEncDelivery_SourceEvent' AND object_id = OBJECT_ID('dbo.ProductIcEncDelivery'))
    EXEC(N'CREATE UNIQUE INDEX UX_ProductIcEncDelivery_SourceEvent
        ON dbo.ProductIcEncDelivery(acknowledgement_source, source_event_id, product_export_track_id)
        WHERE source_event_id IS NOT NULL');

COMMIT TRANSACTION;
