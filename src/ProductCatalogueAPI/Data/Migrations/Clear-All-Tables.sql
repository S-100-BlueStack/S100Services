SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_ID() <= 4
    THROW 51200, 'Select the application database, not a system database.', 1;

IF @@TRANCOUNT <> 0
    THROW 51201, 'Run outside an existing transaction.', 1;

-- Complete metadata visibility is required for the boundary checks.
IF ISNULL(IS_MEMBER(N'db_owner'), 0) <> 1
   AND ISNULL(IS_SRVROLEMEMBER(N'sysadmin'), 0) <> 1
    THROW 51202, 'Run as db_owner or sysadmin.', 1;

DECLARE @ApplicationTables TABLE (TableName sysname PRIMARY KEY);
INSERT @ApplicationTables VALUES
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

DECLARE @Targets TABLE (
    ObjectId int PRIMARY KEY,
    QualifiedName nvarchar(517) NOT NULL
);

INSERT @Targets
SELECT t.object_id, QUOTENAME(s.name) + N'.' + QUOTENAME(t.name)
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE t.is_ms_shipped = 0
  AND (
      (
          s.name COLLATE Latin1_General_100_BIN2 = N'dbo'
          AND EXISTS (
              SELECT 1
              FROM @ApplicationTables AS a
              WHERE a.TableName COLLATE Latin1_General_100_BIN2
                  = t.name COLLATE Latin1_General_100_BIN2
          )
      )
      OR LOWER(s.name) COLLATE Latin1_General_100_BIN2 = N'hangfire'
  );

DECLARE @Remaining TABLE (ObjectId int PRIMARY KEY);
DECLARE @Order TABLE (
    SequenceNo int IDENTITY(1,1),
    ObjectId int PRIMARY KEY
);
DECLARE @Results TABLE (
    TableName nvarchar(517),
    RowsDeleted bigint
);

DECLARE @ObjectId int;
DECLARE @Name nvarchar(517);
DECLARE @Sql nvarchar(max);
DECLARE @Rows bigint;
DECLARE @Locked int;
DECLARE @SequenceNo int = 1;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Lock only the selected tables before checking dependencies.
    INSERT @Remaining SELECT ObjectId FROM @Targets;

    WHILE EXISTS (SELECT 1 FROM @Remaining)
    BEGIN
        SELECT TOP (1) @ObjectId = ObjectId
        FROM @Remaining
        ORDER BY ObjectId;

        SELECT @Name = QualifiedName
        FROM @Targets
        WHERE ObjectId = @ObjectId;

        SET @Sql = N'SELECT TOP (1) @Locked = 1 FROM '
                 + @Name + N' WITH (TABLOCKX, HOLDLOCK);';

        EXEC sys.sp_executesql
            @Sql, N'@Locked int OUTPUT', @Locked OUTPUT;

        IF ISNULL(OBJECT_ID(@Name, N'U'), -1) <> @ObjectId
            THROW 51203, 'A target table changed during preparation.', 1;

        DELETE FROM @Remaining WHERE ObjectId = @ObjectId;
    END;

    -- Never cascade into or alter relationships with excluded tables.
    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys AS fk
        WHERE
            (
                EXISTS (
                    SELECT 1 FROM @Targets
                    WHERE ObjectId = fk.parent_object_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM @Targets
                    WHERE ObjectId = fk.referenced_object_id
                )
            )
            OR
            (
                EXISTS (
                    SELECT 1 FROM @Targets
                    WHERE ObjectId = fk.referenced_object_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM @Targets
                    WHERE ObjectId = fk.parent_object_id
                )
            )
    )
        THROW 51204, 'A foreign key crosses the allowed table boundary. Nothing was deleted.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.triggers AS tr
        JOIN @Targets AS t ON t.ObjectId = tr.parent_id
        WHERE tr.is_disabled = 0
    )
        THROW 51205, 'An enabled trigger could affect other tables. Nothing was deleted.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables AS t
        JOIN @Targets AS x ON x.ObjectId = t.object_id
        WHERE t.temporal_type <> 0
           OR t.is_tracked_by_cdc = 1
           OR t.is_replicated = 1
           OR t.is_merge_published = 1
    )
        THROW 51206, 'A target uses history, CDC or replication. Nothing was deleted.', 1;

    -- Calculate the complete child-before-parent deletion order.
    INSERT @Remaining SELECT ObjectId FROM @Targets;

    WHILE EXISTS (SELECT 1 FROM @Remaining)
    BEGIN
        SET @ObjectId = NULL;

        SELECT TOP (1) @ObjectId = r.ObjectId
        FROM @Remaining AS r
        WHERE NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys AS fk
            JOIN @Remaining AS child
                ON child.ObjectId = fk.parent_object_id
            WHERE fk.referenced_object_id = r.ObjectId
        )
        ORDER BY r.ObjectId;

        IF @ObjectId IS NULL
            THROW 51207, 'Cyclic foreign keys prevent safe deletion. Nothing was deleted.', 1;

        INSERT @Order (ObjectId) VALUES (@ObjectId);
        DELETE FROM @Remaining WHERE ObjectId = @ObjectId;
    END;

    WHILE @SequenceNo <= (SELECT COUNT(*) FROM @Order)
    BEGIN
        SELECT @Name = t.QualifiedName
        FROM @Order AS o
        JOIN @Targets AS t ON t.ObjectId = o.ObjectId
        WHERE o.SequenceNo = @SequenceNo;

        SET @Sql = N'DELETE FROM ' + @Name
                 + N'; SET @Rows = ROWCOUNT_BIG();';

        EXEC sys.sp_executesql
            @Sql, N'@Rows bigint OUTPUT', @Rows OUTPUT;

        INSERT @Results VALUES (@Name, @Rows);
        SET @SequenceNo += 1;
    END;

    COMMIT TRANSACTION;

    SELECT DB_NAME() AS DatabaseName, TableName, RowsDeleted
    FROM @Results
    ORDER BY TableName;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;