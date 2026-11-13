namespace TestProductCatalogueAPI;

/// <summary>Opt-in checks of the real development clear script in the existing unique disposable SQL database fixture.</summary>
public sealed class HangfireResetSqlTests
{
    /// <summary>Job data is cleared while schema version metadata and excluded application/geodatabase tables survive repeated resets.</summary>
    [DpcSqlFact]
    public async Task ClearPreservesHangfireInstallationMetadataAndExistingTableBoundaries() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        await db.ExecuteAsync("""
            EXEC('CREATE SCHEMA [HangFire]');
            CREATE TABLE [HangFire].[Schema] ([Version] int NOT NULL);
            INSERT [HangFire].[Schema] VALUES (9);
            CREATE TABLE [HangFire].[Job] ([Id] int NOT NULL);
            INSERT [HangFire].[Job] VALUES (1);
            EXEC('CREATE SCHEMA [main]');
            CREATE TABLE [main].[KeepMe] ([Id] int NOT NULL);
            INSERT [main].[KeepMe] VALUES (1);
            CREATE TABLE [dbo].[KeepMe] ([Id] int NOT NULL);
            INSERT [dbo].[KeepMe] VALUES (1);
            INSERT [dbo].[JobRunState] (job_name, last_successful_run_utc) VALUES ('fixture', SYSUTCDATETIME());
            """);
        var clear = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "DpcMigrations", "Clear-All-Tables.sql"));
        for (var attempt = 0; attempt < 2; attempt++) {
            await db.ExecuteAsync(clear);
            Assert.Equal(9, await db.QueryAsync<int>("SELECT [Version] FROM [HangFire].[Schema];"));
            Assert.Equal(0, await db.QueryAsync<int>("SELECT COUNT(*) FROM [HangFire].[Job];"));
            Assert.Equal(0, await db.QueryAsync<int>("SELECT COUNT(*) FROM [dbo].[JobRunState];"));
            Assert.Equal(1, await db.QueryAsync<int>("SELECT COUNT(*) FROM [main].[KeepMe];"));
            Assert.Equal(1, await db.QueryAsync<int>("SELECT COUNT(*) FROM [dbo].[KeepMe];"));
        }
    }
}
