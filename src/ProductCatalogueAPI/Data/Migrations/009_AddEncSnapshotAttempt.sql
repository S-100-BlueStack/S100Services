-- Apply to the Product Catalogue System database before deploying the retry gate.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.EncPackageReplay', N'U') IS NULL
        THROW 51110, 'ENC snapshot attempts require migration 004.', 1;
    IF COL_LENGTH(N'dbo.EncPackageReplay', N'last_snapshot_attempt_utc') IS NULL
        ALTER TABLE dbo.EncPackageReplay ADD last_snapshot_attempt_utc datetime2(7) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EncPackageReplay')
                   AND name = N'last_snapshot_attempt_utc' AND system_type_id = 42 AND scale = 7 AND is_nullable = 1)
        THROW 51111, 'ENC snapshot attempt column has an incompatible definition.', 1;
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.EncPackageReplay')
                   AND name = N'CK_EncPackageReplay_SnapshotAttempt')
        EXEC(N'ALTER TABLE dbo.EncPackageReplay ADD CONSTRAINT CK_EncPackageReplay_SnapshotAttempt
            CHECK (last_snapshot_attempt_utc IS NULL OR last_snapshot_attempt_utc >= scan_from_utc);');
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
