-- B1-lite: package Pause persistence, independent of replaceable EncPackage snapshots.
-- Apply as a database-owner migration to the Product Catalogue System database only.
-- No startup migration, legacy-package adoption, Send/Accept or scheduling is included.
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.EncPackage', N'U') IS NULL OR OBJECT_ID(N'dbo.EncPackageReplay', N'U') IS NULL
        THROW 51040, 'B1-lite requires the existing ENC package schema (migration 004).', 1;

    IF OBJECT_ID(N'dbo.EncPackageControl') IS NULL
    BEGIN
        CREATE TABLE dbo.EncPackageControl (
            source_dataset_name nvarchar(64) NOT NULL CONSTRAINT PK_EncPackageControl PRIMARY KEY,
            is_paused bit NOT NULL CONSTRAINT DF_EncPackageControl_IsPaused DEFAULT (0),
            paused_at_utc datetime2(7) NULL,
            updated_at_utc datetime2(7) NOT NULL,
            row_version rowversion NOT NULL,
            CONSTRAINT CK_EncPackageControl_PauseTimestamp CHECK (
                (is_paused = 1 AND paused_at_utc IS NOT NULL)
                OR (is_paused = 0 AND paused_at_utc IS NULL)
            )
        );
    END;

    IF OBJECT_ID(N'dbo.EncPackageControl', N'U') IS NULL
        THROW 51041, 'B1-lite EncPackageControl exists but is not a user table.', 1;

    DECLARE @TableId int = OBJECT_ID(N'dbo.EncPackageControl', N'U');
    IF (
        SELECT COUNT(*) FROM sys.columns WHERE object_id = @TableId
    ) <> 5
        THROW 51042, 'B1-lite EncPackageControl column count is incompatible.', 1;

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'source_dataset_name' AND system_type_id = 231 AND max_length = 128 AND is_nullable = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'is_paused' AND system_type_id = 104 AND is_nullable = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'paused_at_utc' AND system_type_id = 42 AND scale = 7 AND is_nullable = 1)
        OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'updated_at_utc' AND system_type_id = 42 AND scale = 7 AND is_nullable = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'row_version' AND system_type_id = 189 AND is_nullable = 0)
        THROW 51043, 'B1-lite EncPackageControl column definitions are incompatible.', 1;

    IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id = @TableId AND name = N'PK_EncPackageControl' AND type = 'PK')
        OR NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = @TableId AND name = N'DF_EncPackageControl_IsPaused')
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = @TableId AND name = N'CK_EncPackageControl_PauseTimestamp' AND is_disabled = 0 AND is_not_trusted = 0)
        THROW 51044, 'B1-lite EncPackageControl constraints are missing or untrusted.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
