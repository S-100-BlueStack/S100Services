-- Apply after 001, 002 and 003 to the Product Catalogue system database only.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.EncPackage', N'U') IS NULL
BEGIN
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
END;

IF OBJECT_ID(N'dbo.EncPackageReplay', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EncPackageReplay (
        source_dataset_name nvarchar(64) NOT NULL CONSTRAINT PK_EncPackageReplay PRIMARY KEY,
        scan_from_utc datetime2(7) NOT NULL
    );
END;

COMMIT TRANSACTION;
