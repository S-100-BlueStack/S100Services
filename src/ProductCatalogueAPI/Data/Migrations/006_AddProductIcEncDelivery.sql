-- Apply to the ProductCatalogue System database before enabling SendToIcEnc:Mode=Live.
IF OBJECT_ID(N'dbo.ProductIcEncDelivery', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductIcEncDelivery (
        delivery_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductIcEncDelivery PRIMARY KEY,
        product_export_track_id uniqueidentifier NOT NULL,
        product_revision_id uniqueidentifier NOT NULL,
        job_id nvarchar(100) NOT NULL,
        status varchar(16) NOT NULL,
        reserved_at_utc datetime2 NOT NULL,
        completed_at_utc datetime2 NULL,
        error_message nvarchar(1000) NULL,
        CONSTRAINT FK_ProductIcEncDelivery_Track FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id),
        CONSTRAINT FK_ProductIcEncDelivery_Revision FOREIGN KEY (product_revision_id) REFERENCES dbo.ProductRevision(product_revision_id),
        CONSTRAINT CK_ProductIcEncDelivery_Status CHECK (status IN ('Sending', 'Delivered', 'Uncertain', 'NotDelivered'))
    );
    CREATE UNIQUE INDEX UX_ProductIcEncDelivery_ActiveRevision ON dbo.ProductIcEncDelivery(product_revision_id)
        WHERE status <> 'NotDelivered';
    CREATE INDEX IX_ProductIcEncDelivery_Track ON dbo.ProductIcEncDelivery(product_export_track_id, reserved_at_utc DESC);
END;
