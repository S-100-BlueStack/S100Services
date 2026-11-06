-- Apply to the ProductCatalogue SYSTEM database before deploying the updated API/Worker.
-- Historical build times cannot be reconstructed reliably from archive scan cutoffs.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.EncPackage', N'U') IS NULL
    THROW 50000, 'dbo.EncPackage is missing. Apply the preceding system database migrations first.', 1;

IF COL_LENGTH(N'dbo.EncPackage', N'built_at_utc') IS NULL
BEGIN
    -- Nullable without WITH VALUES deliberately leaves existing rows unknown.
    ALTER TABLE dbo.EncPackage ADD built_at_utc datetime2(7) NULL
        CONSTRAINT DF_EncPackage_BuiltAtUtc DEFAULT (SYSUTCDATETIME());
END;

COMMIT TRANSACTION;
