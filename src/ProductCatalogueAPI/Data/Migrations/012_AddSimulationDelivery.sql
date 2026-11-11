-- Apply only to the ProductCatalogue System database after migration 011.
-- Existing deliveries remain live; synthetic workflow sends retain their provenance permanently.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.ProductIcEncDelivery', N'U') IS NULL
    THROW 51200, 'Apply the ProductCatalogue delivery migrations before 012.', 1;
IF COL_LENGTH(N'dbo.ProductIcEncDelivery', N'is_simulation') IS NULL
    ALTER TABLE dbo.ProductIcEncDelivery ADD is_simulation bit NOT NULL CONSTRAINT DF_ProductIcEncDelivery_IsSimulation DEFAULT (0) WITH VALUES;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.ProductIcEncDelivery') AND name = N'CK_ProductIcEncDelivery_AcknowledgementSource')
    ALTER TABLE dbo.ProductIcEncDelivery DROP CONSTRAINT CK_ProductIcEncDelivery_AcknowledgementSource;
ALTER TABLE dbo.ProductIcEncDelivery WITH CHECK ADD CONSTRAINT CK_ProductIcEncDelivery_AcknowledgementSource
    CHECK (acknowledgement_source IS NULL OR acknowledgement_source IN ('Email', 'Manual', 'Simulation'));
COMMIT TRANSACTION;
