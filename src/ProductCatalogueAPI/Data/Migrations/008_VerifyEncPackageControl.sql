-- B1-lite: read-only database-owner verification after migration 008.
-- Execute in the Product Catalogue System database, not Hangfire or S-128.
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.EncPackage', N'U') IS NULL OR OBJECT_ID(N'dbo.EncPackageReplay', N'U') IS NULL
    THROW 51050, 'B1-lite prerequisite ENC schema is missing.', 1;
IF OBJECT_ID(N'dbo.EncPackageControl', N'U') IS NULL
    THROW 51051, 'B1-lite EncPackageControl is missing.', 1;

DECLARE @TableId int = OBJECT_ID(N'dbo.EncPackageControl', N'U');
IF (SELECT COUNT(*) FROM sys.columns WHERE object_id = @TableId) <> 5
    THROW 51052, 'B1-lite control column count does not match.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'source_dataset_name' AND system_type_id = 231 AND max_length = 128 AND is_nullable = 0)
    OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'is_paused' AND system_type_id = 104 AND is_nullable = 0)
    OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'paused_at_utc' AND system_type_id = 42 AND scale = 7 AND is_nullable = 1)
    OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'updated_at_utc' AND system_type_id = 42 AND scale = 7 AND is_nullable = 0)
    OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @TableId AND name = N'row_version' AND system_type_id = 189 AND is_nullable = 0)
    THROW 51053, 'B1-lite control column definitions do not match.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints k
    INNER JOIN sys.indexes i ON i.object_id = k.parent_object_id AND i.index_id = k.unique_index_id
    INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE k.parent_object_id = @TableId AND k.name = N'PK_EncPackageControl'
      AND k.type = 'PK' AND ic.key_ordinal = 1 AND c.name = N'source_dataset_name'
      AND NOT EXISTS (SELECT 1 FROM sys.index_columns extra WHERE extra.object_id = ic.object_id AND extra.index_id = ic.index_id AND extra.key_ordinal > 1)
)
    THROW 51054, 'B1-lite source identity primary key does not match.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = @TableId AND name = N'DF_EncPackageControl_IsPaused')
    OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = @TableId AND name = N'CK_EncPackageControl_PauseTimestamp' AND is_disabled = 0 AND is_not_trusted = 0)
    THROW 51055, 'B1-lite control defaults/check constraints are missing or untrusted.', 1;
IF EXISTS (SELECT 1 FROM dbo.EncPackageControl WHERE is_paused = 1 AND paused_at_utc IS NULL OR is_paused = 0 AND paused_at_utc IS NOT NULL)
    THROW 51056, 'B1-lite control row violates the Pause timestamp invariant.', 1;

PRINT 'B1-lite EncPackageControl verification succeeded.';
