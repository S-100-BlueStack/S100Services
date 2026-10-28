-- BE108A_001: read-only deployment gate. Any incompatibility raises an error.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

-- Run as database owner in the actual System database with full metadata visibility.
DECLARE @StateHistoryTableId int = OBJECT_ID(N'dbo.ProductStateHistory', N'U');
IF @StateHistoryTableId IS NULL
    THROW 51080, 'BE108A: dbo.ProductStateHistory must exist. Run the normalized workflow migration before BE108A_001.', 1;
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = @StateHistoryTableId AND name = N'product_state_history_id'
      AND system_type_id = TYPE_ID(N'uniqueidentifier') AND user_type_id = TYPE_ID(N'uniqueidentifier')
      AND max_length = 16 AND is_nullable = 0 AND is_computed = 0 AND is_identity = 0
      AND generated_always_type = 0 AND is_hidden = 0 AND is_masked = 0
      AND encryption_type IS NULL AND rule_object_id = 0
)
    THROW 51081, 'BE108A: ProductStateHistory.product_state_history_id must be a non-null application-insertable uniqueidentifier.', 1;
IF NOT EXISTS (
    SELECT 1
    FROM sys.key_constraints k
    JOIN sys.indexes i ON i.object_id = k.parent_object_id AND i.index_id = k.unique_index_id
    WHERE k.parent_object_id = @StateHistoryTableId
      AND k.type = N'PK'
      AND i.is_unique = 1 AND i.is_primary_key = 1 AND i.is_disabled = 0
      AND i.is_hypothetical = 0 AND i.has_filter = 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
            AND ic.key_ordinal = 1 AND ic.is_included_column = 0
            AND c.name = N'product_state_history_id'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
            AND ic.key_ordinal > 1 AND ic.is_included_column = 0
      )
)
    THROW 51082, 'BE108A: ProductStateHistory.product_state_history_id must be the single-column primary key.', 1;
IF EXISTS (
    SELECT 1 FROM sys.triggers t JOIN sys.trigger_events e ON e.object_id = t.object_id
    WHERE t.parent_id = @StateHistoryTableId AND t.is_disabled = 0 AND e.type_desc = N'INSERT'
)
    THROW 51083, 'BE108A: ProductStateHistory has an INSERT trigger; the database owner must review the state-ID contract.', 1;
-- The normalized workflow already supplies explicit ProductStateHistory IDs. No default is required
-- or modified by BE-108A. The rollback-only insert below remains a deployment verification gate.

-- BEGIN SHARED CONTRACT VERIFICATION
DECLARE @TableId int = OBJECT_ID(N'dbo.ProductHistoryEvent', N'U');
IF @TableId IS NULL
    THROW 51084, 'BE108A: dbo.ProductHistoryEvent must be a user table.', 1;
IF EXISTS (SELECT 1 FROM sys.tables WHERE object_id = @TableId
           AND (is_memory_optimized <> 0 OR temporal_type <> 0 OR is_filetable <> 0))
    THROW 51085, 'BE108A: incompatible audit table storage mode.', 1;
DECLARE @ExpectedColumns TABLE (Name sysname, TypeName sysname, MaxLength smallint, Scale tinyint, IsNullable bit);
INSERT @ExpectedColumns VALUES
    (N'Id', N'uniqueidentifier', 16, 0, 0),
    (N'OperationId', N'uniqueidentifier', 16, 0, 0),
    (N'StateRecordId', N'uniqueidentifier', 16, 0, 1),
    (N'DatasetName', N'nvarchar', 512, 0, 0),
    (N'EventType', N'nvarchar', 128, 0, 0),
    (N'Outcome', N'nvarchar', 64, 0, 1),
    (N'Code', N'nvarchar', 256, 0, 1),
    (N'SafeMessage', N'nvarchar', 2048, 0, 1),
    (N'CorrelationId', N'nvarchar', 256, 0, 1),
    (N'JobId', N'nvarchar', 256, 0, 1),
    (N'ExportTarget', N'nvarchar', 64, 0, 1),
    (N'OperationMetadataJson', N'nvarchar', 8000, 0, 1),
    (N'CreatedAtUtc', N'datetime2', 8, 7, 0),
    (N'UpdatedAtUtc', N'datetime2', 8, 7, 0),
    (N'ExecutionStartedAtUtc', N'datetime2', 8, 7, 1),
    (N'FinalizedAtUtc', N'datetime2', 8, 7, 1),
    (N'OccurredAtUtc', N'datetime2', 8, 7, 1);
IF (SELECT COUNT(*) FROM sys.columns WHERE object_id = @TableId) <> (SELECT COUNT(*) FROM @ExpectedColumns)
    THROW 51086, 'BE108A: unexpected audit columns.', 1;
IF EXISTS (
    SELECT 1 FROM @ExpectedColumns e
    LEFT JOIN sys.columns c ON c.object_id = @TableId AND c.name = e.Name
    WHERE c.column_id IS NULL OR c.system_type_id <> TYPE_ID(e.TypeName) OR c.user_type_id <> TYPE_ID(e.TypeName)
       OR c.max_length <> e.MaxLength OR c.scale <> e.Scale OR c.is_nullable <> e.IsNullable
       OR c.is_computed <> 0 OR c.is_identity <> 0 OR c.generated_always_type <> 0
       OR c.default_object_id <> 0 OR c.rule_object_id <> 0 OR c.is_sparse <> 0
       OR c.is_column_set <> 0 OR c.is_rowguidcol <> 0 OR c.is_filestream <> 0
       OR c.is_hidden <> 0 OR c.is_masked <> 0 OR c.encryption_type IS NOT NULL
       OR (e.TypeName = N'nvarchar' AND c.is_ansi_padded <> 1)
)
    THROW 51087, 'BE108A: incompatible audit column type, size, nullability, default or generation contract.', 1;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = @TableId)
   OR EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = @TableId OR referenced_object_id = @TableId)
   OR EXISTS (SELECT 1 FROM sys.triggers WHERE parent_id = @TableId)
   OR EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id = @TableId)
    THROW 51088, 'BE108A: unexpected audit constraint, trigger or security predicate.', 1;

DECLARE @ExpectedIndexes TABLE (Name sysname, IndexType tinyint, IsUnique bit, IsPrimary bit, IsConstraint bit, FilterDefinition nvarchar(256));
INSERT @ExpectedIndexes VALUES
    (N'PK_ProductHistoryEvent', 1, 1, 1, 0, NULL),
    (N'UQ_ProductHistoryEvent_OperationId', 2, 1, 0, 1, NULL),
    (N'IX_ProductHistoryEvent_DatasetName_OccurredAtUtc', 2, 0, 0, 0, NULL),
    (N'IX_ProductHistoryEvent_Pending', 2, 0, 0, 0, N'FinalizedAtUtcISNULL');
IF (SELECT COUNT(*) FROM sys.indexes WHERE object_id = @TableId) <> 4
    THROW 51089, 'BE108A: unexpected audit index set.', 1;
IF EXISTS (
    SELECT 1 FROM @ExpectedIndexes e
    LEFT JOIN sys.indexes i ON i.object_id = @TableId AND i.name = e.Name
    WHERE i.index_id IS NULL OR i.type <> e.IndexType OR i.is_unique <> e.IsUnique
       OR i.is_primary_key <> e.IsPrimary OR i.is_unique_constraint <> e.IsConstraint
       OR i.is_disabled <> 0 OR i.is_hypothetical <> 0 OR i.ignore_dup_key <> 0
       OR i.has_filter <> CASE WHEN e.FilterDefinition IS NULL THEN 0 ELSE 1 END
       OR ISNULL(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i.filter_definition,
           N'[', N''), N']', N''), N'(', N''), N')', N''), N' ', N''), CHAR(13), N''), CHAR(10), N''), N'')
          COLLATE Latin1_General_100_BIN2 <> ISNULL(e.FilterDefinition, N'') COLLATE Latin1_General_100_BIN2
)
    THROW 51090, 'BE108A: incompatible audit key/index uniqueness, type, enabled state or filter.', 1;
IF (SELECT COUNT(*) FROM sys.key_constraints WHERE parent_object_id = @TableId) <> 2
   OR NOT EXISTS (SELECT 1 FROM sys.key_constraints k JOIN sys.indexes i
       ON i.object_id = k.parent_object_id AND i.index_id = k.unique_index_id
       WHERE k.parent_object_id = @TableId AND k.name = N'PK_ProductHistoryEvent'
         AND k.type = N'PK' AND i.name = k.name)
   OR NOT EXISTS (SELECT 1 FROM sys.key_constraints k JOIN sys.indexes i
       ON i.object_id = k.parent_object_id AND i.index_id = k.unique_index_id
       WHERE k.parent_object_id = @TableId AND k.name = N'UQ_ProductHistoryEvent_OperationId'
         AND k.type = N'UQ' AND i.name = k.name)
    THROW 51091, 'BE108A: incompatible primary or operation key constraint.', 1;
DECLARE @ExpectedKeys TABLE (IndexName sysname, ColumnName sysname, KeyOrdinal int, IsDescending bit, IsIncluded bit);
INSERT @ExpectedKeys VALUES
    (N'PK_ProductHistoryEvent', N'Id', 1, 0, 0),
    (N'UQ_ProductHistoryEvent_OperationId', N'OperationId', 1, 0, 0),
    (N'IX_ProductHistoryEvent_DatasetName_OccurredAtUtc', N'DatasetName', 1, 0, 0),
    (N'IX_ProductHistoryEvent_DatasetName_OccurredAtUtc', N'OccurredAtUtc', 2, 1, 0),
    (N'IX_ProductHistoryEvent_Pending', N'UpdatedAtUtc', 1, 0, 0),
    (N'IX_ProductHistoryEvent_Pending', N'OperationId', 2, 0, 0),
    (N'IX_ProductHistoryEvent_Pending', N'FinalizedAtUtc', 0, 0, 1);
IF EXISTS (
    SELECT i.name, c.name, ic.key_ordinal, ic.is_descending_key, ic.is_included_column
    FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = @TableId
    EXCEPT SELECT IndexName, ColumnName, KeyOrdinal, IsDescending, IsIncluded FROM @ExpectedKeys
) OR EXISTS (
    SELECT IndexName, ColumnName, KeyOrdinal, IsDescending, IsIncluded FROM @ExpectedKeys
    EXCEPT
    SELECT i.name, c.name, ic.key_ordinal, ic.is_descending_key, ic.is_included_column
    FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = @TableId
)
    THROW 51092, 'BE108A: incompatible audit index columns, order or includes.', 1;
-- END SHARED CONTRACT VERIFICATION
PRINT 'BE108A_001 verification succeeded.';
