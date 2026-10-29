/*
Product Catalogue - fresh System schema for an existing SQL Server database.
Generated 2026-10-29 from the latest supplied S100Services snapshot:
  09e712e5eaa194ece996277e642683aef34aa3fe (clean main).

In SSMS, select the existing database that will be used by SystemConnection
(the S-128 database if co-locating application tables with the geodatabase),
then execute this entire file as the database owner. No database name is assumed.
The API and Worker must point SystemConnection at this same database.

Includes the final schema from migrations 001, 002, 003, 004, 006, 007, 008
and BE108A_001, with their keys, constraints, defaults and indexes.
This replaces those migrations for a FRESH application schema only.
No legacy JobTable conversion, seed products or checkpoint rows are needed.

Creates 14 dbo application tables in one transaction. Stops if any expected
application object already exists; use incremental migrations for upgrades.
Unrelated existing dbo/S100/S128/sde geodatabase objects are left untouched.
Does not create a database, Hangfire objects, spatial tables, users or grants.
Does not drop, truncate or alter existing tables. Errors roll back creation.

Validation: definitions/indexes compared with included migrations and runtime
references; SQL Server execution was unavailable in the generation environment.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_ID() <= 4
    THROW 51100, 'Select the intended application/S-128 database, not a SQL Server system database.', 1;
IF @@TRANCOUNT <> 0
    THROW 51101, 'Run this fresh-schema script outside an existing transaction.', 1;

DECLARE @ApplicationTables TABLE (TableName sysname NOT NULL PRIMARY KEY);
INSERT @ApplicationTables (TableName) VALUES
    (N'JobRunState'),
    (N'Product'),
    (N'ProductExportTrack'),
    (N'ProductStateHistory'),
    (N'ProductRevision'),
    (N'ProductArtifact'),
    (N'ProductChangeSummary'),
    (N'ProductChange'),
    (N'ProductExportTrackFreezeHold'),
    (N'EncPackage'),
    (N'EncPackageReplay'),
    (N'ProductIcEncDelivery'),
    (N'EncPackageControl'),
    (N'ProductHistoryEvent');

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ExistingObject sysname;
    SELECT TOP (1) @ExistingObject = expected.TableName
    FROM @ApplicationTables expected
    WHERE OBJECT_ID(N'dbo.' + QUOTENAME(expected.TableName)) IS NOT NULL
    ORDER BY expected.TableName;
    IF @ExistingObject IS NOT NULL
    BEGIN
        DECLARE @ExistingMessage nvarchar(2048) =
            N'Fresh schema creation stopped: dbo.' + @ExistingObject +
            N' already exists. No existing objects were changed. Use incremental migrations for an existing installation.';
        THROW 51102, @ExistingMessage, 1;
    END;

-- dbo.JobRunState
CREATE TABLE dbo.JobRunState (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobRunState PRIMARY KEY,
    job_name nvarchar(256) NOT NULL,
    last_successful_run_utc datetime2(7) NOT NULL
);

CREATE INDEX IX_JobRunState_JobNameId ON dbo.JobRunState(job_name, id DESC);

-- dbo.Product
CREATE TABLE dbo.Product (
    product_id uniqueidentifier NOT NULL CONSTRAINT PK_Product PRIMARY KEY,
    dataset_name nvarchar(64) NOT NULL,
    created_at_utc datetime2(7) NOT NULL,
    CONSTRAINT UQ_Product_DatasetName UNIQUE (dataset_name)
);

-- dbo.ProductExportTrack
CREATE TABLE dbo.ProductExportTrack (
    product_export_track_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductExportTrack PRIMARY KEY,
    product_id uniqueidentifier NOT NULL,
    product_specification varchar(8) NOT NULL,
    export_engine varchar(16) NOT NULL,
    state int NOT NULL,
    published_edition int NOT NULL,
    published_update int NOT NULL,
    candidate_edition int NULL,
    candidate_update int NULL,
    candidate_previous_state int NULL,
    updated_at_utc datetime2(7) NOT NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT FK_ProductExportTrack_Product FOREIGN KEY (product_id) REFERENCES dbo.Product(product_id),
    CONSTRAINT UQ_ProductExportTrack_ProductSpecification UNIQUE (product_id, product_specification),
    CONSTRAINT CK_ProductExportTrack_ProductSpecification CHECK (product_specification IN ('S57', 'S101', 'S102', 'S122')),
    CONSTRAINT CK_ProductExportTrack_ExportEngine CHECK (export_engine IN ('IsoIec8211', 'Hdf5', 'Gml')),
    CONSTRAINT CK_ProductExportTrack_PublishedVersion CHECK (published_edition >= 0 AND published_update >= 0),
    CONSTRAINT CK_ProductExportTrack_CandidateVersion CHECK ((candidate_edition IS NULL AND candidate_update IS NULL) OR (candidate_edition >= 0 AND candidate_update >= 0))
);

-- dbo.ProductStateHistory
CREATE TABLE dbo.ProductStateHistory (
    product_state_history_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductStateHistory PRIMARY KEY,
    product_export_track_id uniqueidentifier NOT NULL,
    state int NOT NULL,
    edition_number int NOT NULL,
    update_number int NOT NULL,
    owner nvarchar(256) NULL,
    occurred_at_utc datetime2(7) NOT NULL,
    error_code nvarchar(64) NULL,
    error_message nvarchar(1024) NULL,
    CONSTRAINT FK_ProductStateHistory_ProductExportTrack FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id),
    CONSTRAINT CK_ProductStateHistory_Version CHECK (edition_number >= 0 AND update_number >= 0)
);

CREATE INDEX IX_ProductStateHistory_TrackOccurredAt ON dbo.ProductStateHistory(product_export_track_id, occurred_at_utc DESC);
CREATE INDEX IX_ProductStateHistory_OccurredAt ON dbo.ProductStateHistory(occurred_at_utc DESC);

-- dbo.ProductRevision
CREATE TABLE dbo.ProductRevision (
    product_revision_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductRevision PRIMARY KEY,
    product_export_track_id uniqueidentifier NOT NULL,
    revision_type varchar(16) NOT NULL,
    edition_number int NOT NULL,
    update_number int NOT NULL,
    dataset_yaml nvarchar(max) NOT NULL,
    change_summary_yaml nvarchar(max) NULL,
    created_by nvarchar(256) NULL,
    created_at_utc datetime2(7) NOT NULL,
    CONSTRAINT FK_ProductRevision_ProductExportTrack FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id),
    CONSTRAINT CK_ProductRevision_Type CHECK (revision_type IN ('NewEdition', 'Update')),
    CONSTRAINT CK_ProductRevision_Version CHECK (edition_number >= 0 AND update_number >= 0)
);

CREATE INDEX IX_ProductRevision_TrackVersionCreatedAt ON dbo.ProductRevision(product_export_track_id, edition_number, update_number, created_at_utc DESC);

-- dbo.ProductArtifact
CREATE TABLE dbo.ProductArtifact (
    product_artifact_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductArtifact PRIMARY KEY,
    product_export_track_id uniqueidentifier NOT NULL,
    product_revision_id uniqueidentifier NULL,
    artifact_kind varchar(32) NOT NULL,
    file_name nvarchar(260) NOT NULL,
    media_type nvarchar(128) NOT NULL,
    content varbinary(max) NOT NULL,
    sha256 binary(32) NOT NULL,
    metadata_json nvarchar(max) NULL,
    created_at_utc datetime2(7) NOT NULL,
    CONSTRAINT FK_ProductArtifact_ProductExportTrack FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id),
    CONSTRAINT FK_ProductArtifact_ProductRevision FOREIGN KEY (product_revision_id) REFERENCES dbo.ProductRevision(product_revision_id),
    CONSTRAINT CK_ProductArtifact_MetadataJson CHECK (metadata_json IS NULL OR ISJSON(metadata_json) = 1)
);

CREATE INDEX IX_ProductArtifact_TrackKindCreatedAt ON dbo.ProductArtifact(product_export_track_id, artifact_kind, created_at_utc DESC);

-- dbo.ProductChangeSummary
CREATE TABLE dbo.ProductChangeSummary (
    product_change_summary_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductChangeSummary PRIMARY KEY,
    product_export_track_id uniqueidentifier NOT NULL,
    work_date date NOT NULL,
    summary_yaml nvarchar(max) NOT NULL,
    first_detected_at_utc datetime2(7) NOT NULL,
    last_detected_at_utc datetime2(7) NOT NULL,
    is_closed bit NOT NULL CONSTRAINT DF_ProductChangeSummary_IsClosed DEFAULT (0),
    closed_at_utc datetime2(7) NULL,
    CONSTRAINT FK_ProductChangeSummary_ProductExportTrack FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id),
    CONSTRAINT UQ_ProductChangeSummary_TrackWorkDate UNIQUE (product_export_track_id, work_date),
    CONSTRAINT CK_ProductChangeSummary_Closed CHECK ((is_closed = 0 AND closed_at_utc IS NULL) OR (is_closed = 1 AND closed_at_utc IS NOT NULL))
);

-- dbo.ProductChange
CREATE TABLE dbo.ProductChange (
    product_change_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductChange PRIMARY KEY,
    product_change_summary_id uniqueidentifier NOT NULL,
    feature_id nvarchar(128) NOT NULL,
    feature_code nvarchar(128) NOT NULL,
    attribute_path nvarchar(512) NOT NULL,
    deleted bit NOT NULL,
    detected_at_utc datetime2(7) NOT NULL,
    CONSTRAINT FK_ProductChange_ProductChangeSummary FOREIGN KEY (product_change_summary_id) REFERENCES dbo.ProductChangeSummary(product_change_summary_id) ON DELETE CASCADE,
    CONSTRAINT UQ_ProductChange_SummaryFeatureAttribute UNIQUE (product_change_summary_id, feature_id, attribute_path)
);

CREATE INDEX IX_ProductChange_Summary ON dbo.ProductChange(product_change_summary_id, feature_id, attribute_path);

-- dbo.ProductExportTrackFreezeHold
CREATE TABLE dbo.ProductExportTrackFreezeHold (
    product_export_track_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductExportTrackFreezeHold PRIMARY KEY,
    frozen_at_utc datetime2(7) NOT NULL,
    frozen_by nvarchar(256) NULL,
    CONSTRAINT FK_ProductExportTrackFreezeHold_ProductExportTrack
        FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id)
);

-- dbo.EncPackage
CREATE TABLE dbo.EncPackage (
    package_id uniqueidentifier NOT NULL CONSTRAINT PK_EncPackage PRIMARY KEY,
    source_dataset_name nvarchar(64) NOT NULL,
    s57_dataset_name nvarchar(64) NOT NULL,
    scan_from_utc datetime2(7) NOT NULL,
    detected_at_utc datetime2(7) NOT NULL,
    dataset_yaml nvarchar(max) NOT NULL,
    summary_yaml nvarchar(max) NOT NULL,
    s57_discarded bit NOT NULL CONSTRAINT DF_EncPackage_S57Discarded DEFAULT (0),
    s101_discarded bit NOT NULL CONSTRAINT DF_EncPackage_S101Discarded DEFAULT (0),
    error_message nvarchar(1024) NULL,
    CONSTRAINT UQ_EncPackage_SourceDataset UNIQUE (source_dataset_name),
    CONSTRAINT CK_EncPackage_ScanWindow CHECK (scan_from_utc <= detected_at_utc)
);

CREATE UNIQUE INDEX UX_EncPackage_S57Dataset ON dbo.EncPackage(s57_dataset_name);

-- dbo.EncPackageReplay
CREATE TABLE dbo.EncPackageReplay (
    source_dataset_name nvarchar(64) NOT NULL CONSTRAINT PK_EncPackageReplay PRIMARY KEY,
    scan_from_utc datetime2(7) NOT NULL
);

-- dbo.ProductIcEncDelivery
CREATE TABLE dbo.ProductIcEncDelivery (
    delivery_id uniqueidentifier NOT NULL CONSTRAINT PK_ProductIcEncDelivery PRIMARY KEY,
    product_export_track_id uniqueidentifier NOT NULL,
    product_revision_id uniqueidentifier NOT NULL,
    job_id nvarchar(100) NOT NULL,
    status varchar(16) NOT NULL,
    reserved_at_utc datetime2 NOT NULL,
    completed_at_utc datetime2 NULL,
    error_message nvarchar(1000) NULL,
    acknowledged_at_utc datetime2(7) NULL,
    acknowledgement_source varchar(16) NULL,
    source_event_id nvarchar(256) NULL,
    notice_reference nvarchar(256) NULL,
    rejection_reason nvarchar(1000) NULL,
    CONSTRAINT FK_ProductIcEncDelivery_Track FOREIGN KEY (product_export_track_id) REFERENCES dbo.ProductExportTrack(product_export_track_id),
    CONSTRAINT FK_ProductIcEncDelivery_Revision FOREIGN KEY (product_revision_id) REFERENCES dbo.ProductRevision(product_revision_id),
    CONSTRAINT CK_ProductIcEncDelivery_Status CHECK (status IN ('Sending', 'Delivered', 'Uncertain', 'NotDelivered', 'Accepted', 'Rejected')),
    CONSTRAINT CK_ProductIcEncDelivery_AcknowledgementSource CHECK (acknowledgement_source IS NULL OR acknowledgement_source IN ('Email', 'Manual'))
);

CREATE UNIQUE INDEX UX_ProductIcEncDelivery_ActiveRevision ON dbo.ProductIcEncDelivery(product_revision_id)
        WHERE status <> 'NotDelivered';
CREATE INDEX IX_ProductIcEncDelivery_Track ON dbo.ProductIcEncDelivery(product_export_track_id, reserved_at_utc DESC);
CREATE UNIQUE INDEX UX_ProductIcEncDelivery_SourceEvent
    ON dbo.ProductIcEncDelivery(acknowledgement_source, source_event_id, product_export_track_id)
    WHERE source_event_id IS NOT NULL;

-- dbo.EncPackageControl
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

-- dbo.ProductHistoryEvent
CREATE TABLE [dbo].[ProductHistoryEvent]
(
    [Id] uniqueidentifier NOT NULL,
    [OperationId] uniqueidentifier NOT NULL,
    [StateRecordId] uniqueidentifier NULL,
    [DatasetName] nvarchar(256) NOT NULL,
    [EventType] nvarchar(64) NOT NULL,
    [Outcome] nvarchar(32) NULL,
    [Code] nvarchar(128) NULL,
    [SafeMessage] nvarchar(1024) NULL,
    [CorrelationId] nvarchar(128) NULL,
    [JobId] nvarchar(128) NULL,
    [ExportTarget] nvarchar(32) NULL,
    [OperationMetadataJson] nvarchar(4000) NULL,
    [CreatedAtUtc] datetime2(7) NOT NULL,
    [UpdatedAtUtc] datetime2(7) NOT NULL,
    [ExecutionStartedAtUtc] datetime2(7) NULL,
    [FinalizedAtUtc] datetime2(7) NULL,
    [OccurredAtUtc] datetime2(7) NULL,
    CONSTRAINT [PK_ProductHistoryEvent] PRIMARY KEY CLUSTERED ([Id] ASC),
    CONSTRAINT [UQ_ProductHistoryEvent_OperationId] UNIQUE NONCLUSTERED ([OperationId] ASC)
);

CREATE NONCLUSTERED INDEX [IX_ProductHistoryEvent_DatasetName_OccurredAtUtc]
        ON [dbo].[ProductHistoryEvent] ([DatasetName] ASC, [OccurredAtUtc] DESC);
CREATE NONCLUSTERED INDEX [IX_ProductHistoryEvent_Pending]
        ON [dbo].[ProductHistoryEvent] ([UpdatedAtUtc] ASC, [OperationId] ASC)
        INCLUDE ([FinalizedAtUtc]) WHERE [FinalizedAtUtc] IS NULL;

-- Preserve the existing audit table contract, including its exact index set.

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

    IF EXISTS (
        SELECT 1 FROM @ApplicationTables expected
        WHERE OBJECT_ID(N'dbo.' + QUOTENAME(expected.TableName), N'U') IS NULL
    )
        THROW 51103, 'Application schema creation is incomplete; the transaction will be rolled back.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

PRINT N'Created all 14 Product Catalogue application tables in ' + QUOTENAME(DB_NAME()) + N'.';
SELECT N'dbo.' + expected.TableName AS created_table,
       (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id = t.object_id) AS column_count,
       (SELECT COUNT(*) FROM sys.indexes i WHERE i.object_id = t.object_id AND i.index_id > 0) AS index_count
FROM @ApplicationTables expected
JOIN sys.tables t ON t.schema_id = SCHEMA_ID(N'dbo') AND t.name = expected.TableName
ORDER BY expected.TableName;
