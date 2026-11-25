-- Execute in the ProductCatalogue System database after the normalized workflow migrations.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

IF OBJECT_ID(N'dbo.ProductRevision', N'U') IS NULL OR OBJECT_ID(N'dbo.ProductIcEncDelivery', N'U') IS NULL
    THROW 51300, 'Select the ProductCatalogue System database with the existing product workflow.', 1;
IF @@TRANCOUNT <> 0
    THROW 51301, 'Run this migration outside an existing transaction.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.ProductRevision', N'external_operation_id') IS NULL
        ALTER TABLE dbo.ProductRevision ADD external_operation_id uniqueidentifier NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ProductRevision')
                   AND name = N'UX_ProductRevision_ExternalOperation')
        EXEC(N'CREATE UNIQUE INDEX UX_ProductRevision_ExternalOperation
               ON dbo.ProductRevision(product_export_track_id, external_operation_id)
               WHERE external_operation_id IS NOT NULL;');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
