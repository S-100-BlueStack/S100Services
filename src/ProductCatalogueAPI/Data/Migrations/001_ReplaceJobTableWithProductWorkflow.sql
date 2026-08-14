SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.JobRunState', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.JobRunState (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobRunState PRIMARY KEY,
        job_name nvarchar(256) NOT NULL,
        last_successful_run_utc datetime2(7) NOT NULL
    );
    CREATE INDEX IX_JobRunState_JobNameId ON dbo.JobRunState(job_name, id DESC);
END;

IF OBJECT_ID(N'dbo.Product', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Product (
        product_id uniqueidentifier NOT NULL CONSTRAINT PK_Product PRIMARY KEY,
        dataset_name nvarchar(64) NOT NULL,
        created_at_utc datetime2(7) NOT NULL,
        CONSTRAINT UQ_Product_DatasetName UNIQUE (dataset_name)
    );

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
        updated_at_utc datetime2(7) NOT NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT FK_ProductExportTrack_Product FOREIGN KEY (product_id) REFERENCES dbo.Product(product_id),
        CONSTRAINT UQ_ProductExportTrack_ProductSpecification UNIQUE (product_id, product_specification),
        CONSTRAINT CK_ProductExportTrack_ProductSpecification CHECK (product_specification IN ('S57', 'S101', 'S102', 'S122')),
        CONSTRAINT CK_ProductExportTrack_ExportEngine CHECK (export_engine IN ('IsoIec8211', 'Hdf5', 'Gml')),
        CONSTRAINT CK_ProductExportTrack_PublishedVersion CHECK (published_edition >= 0 AND published_update >= 0),
        CONSTRAINT CK_ProductExportTrack_CandidateVersion CHECK ((candidate_edition IS NULL AND candidate_update IS NULL) OR (candidate_edition >= 0 AND candidate_update >= 0))
    );

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
END;

IF OBJECT_ID(N'dbo.JobTable', N'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.Product (product_id, dataset_name, created_at_utc)
    SELECT NEWID(), source.name, MIN(source.date_from)
    FROM dbo.JobTable source
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Product target WHERE target.dataset_name = source.name)
    GROUP BY source.name;

    ;WITH Normalized AS (
        SELECT source.*,
               CASE
                   WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S57' THEN 'S57'
                   WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S102' THEN 'S102'
                   WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S122' THEN 'S122'
                   ELSE 'S101'
               END AS normalized_specification,
               ROW_NUMBER() OVER (
                   PARTITION BY source.name,
                       CASE
                           WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S57' THEN 'S57'
                           WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S102' THEN 'S102'
                           WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S122' THEN 'S122'
                           ELSE 'S101'
                       END
                   ORDER BY source.date_from DESC, source.id DESC
               ) AS row_number
        FROM dbo.JobTable source
    )
    INSERT INTO dbo.ProductExportTrack
        (product_export_track_id, product_id, product_specification, export_engine, state, published_edition, published_update, candidate_edition, candidate_update, updated_at_utc)
    SELECT NEWID(), product.product_id, normalized.normalized_specification,
           CASE normalized.normalized_specification WHEN 'S102' THEN 'Hdf5' WHEN 'S122' THEN 'Gml' ELSE 'IsoIec8211' END,
           normalized.state, normalized.edition_number, COALESCE(normalized.update_number, 0), NULL, NULL, normalized.date_from
    FROM Normalized normalized
    INNER JOIN dbo.Product product ON product.dataset_name = normalized.name
    WHERE normalized.row_number = 1
      AND NOT EXISTS (
          SELECT 1 FROM dbo.ProductExportTrack target
          WHERE target.product_id = product.product_id AND target.product_specification = normalized.normalized_specification
      );

    ;WITH Normalized AS (
        SELECT source.*,
               CASE
                   WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S57' THEN 'S57'
                   WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S102' THEN 'S102'
                   WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S122' THEN 'S122'
                   ELSE 'S101'
               END AS normalized_specification
        FROM dbo.JobTable source
    )
    INSERT INTO dbo.ProductStateHistory
        (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
    SELECT COALESCE(TRY_CONVERT(uniqueidentifier, normalized.id), NEWID()), track.product_export_track_id,
           normalized.state, normalized.edition_number, COALESCE(normalized.update_number, 0), normalized.owner, normalized.date_from
    FROM Normalized normalized
    INNER JOIN dbo.Product product ON product.dataset_name = normalized.name
    INNER JOIN dbo.ProductExportTrack track ON track.product_id = product.product_id AND track.product_specification = normalized.normalized_specification
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.ProductStateHistory target
        WHERE target.product_state_history_id = COALESCE(TRY_CONVERT(uniqueidentifier, normalized.id), '00000000-0000-0000-0000-000000000000')
    );

    INSERT INTO dbo.ProductArtifact
        (product_artifact_id, product_export_track_id, product_revision_id, artifact_kind, file_name, media_type, content, sha256, created_at_utc)
    SELECT NEWID(), track.product_export_track_id, NULL, 'ValidationReport',
           COALESCE(source.attachment_file_name, 'legacy-attachment.bin'), 'application/octet-stream',
           source.attachment, HASHBYTES('SHA2_256', source.attachment), source.date_from
    FROM dbo.JobTable source
    INNER JOIN dbo.Product product ON product.dataset_name = source.name
    INNER JOIN dbo.ProductExportTrack track ON track.product_id = product.product_id
        AND track.product_specification = CASE
            WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S57' THEN 'S57'
            WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S102' THEN 'S102'
            WHEN UPPER(REPLACE(source.product_specification, '-', '')) = 'S122' THEN 'S122'
            ELSE 'S101'
        END
    WHERE source.attachment IS NOT NULL;

    IF OBJECT_ID(N'dbo.JobTable_Legacy', N'U') IS NOT NULL
        THROW 51000, 'dbo.JobTable_Legacy already exists; the migration will not overwrite it.', 1;

    EXEC sys.sp_rename N'dbo.JobTable', N'JobTable_Legacy';
END;

COMMIT TRANSACTION;
