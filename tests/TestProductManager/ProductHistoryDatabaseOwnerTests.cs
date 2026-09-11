using Dapper;
using Xunit.Abstractions;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.History;

namespace TestProductCatalogueAPI;

/// <summary>Explicit opt-in only. Never run against an external database from Work.</summary>
public class ProductHistoryDatabaseOwnerTests(ITestOutputHelper output)
{
    [DatabaseOwnerFact]
    public async Task SystemDatabaseVerifiesSchemaExplicitStateIdsCanonicalQueriesAndPublicVisibility()
    {
        var connectionFile = Environment.GetEnvironmentVariable("BE108A_SYSTEM_CONNECTION_FILE")!;
        var factory = new DbConnectionFactory(new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Connections:SystemConnection"] = connectionFile }).Build());
        var repository = new ProductHistoryEventRepository(factory);
        var service = new ProductHistoryEventService(repository, TimeProvider.System);
        using var connection = factory.Create();
        connection.Open();
        var folder = ProductHistoryMigrationContractTests.MigrationFolder();

        // Creation remains database-owner executed; this opt-in test repeats its exact scripts.
        await connection.ExecuteAsync(File.ReadAllText(Path.Combine(folder, "BE108A_001_CreateProductHistoryEvent.sql")));
        await connection.ExecuteAsync(File.ReadAllText(Path.Combine(folder, "BE108A_001_VerifyProductHistoryEvent.sql")));
        await connection.ExecuteAsync(File.ReadAllText(Path.Combine(folder, "BE108A_001_CreateProductHistoryEvent.sql")));

        var insertedStateRecordId = Guid.NewGuid();
        output.WriteLine($"Verification ProductStateHistory Id: {insertedStateRecordId}");
        using (var transaction = connection.BeginTransaction())
        {
            try
            {
                // ProductStateHistory is the normalized state-history source. Clone a current track's
                // version/state values with an application-generated ID and roll the row back.
                await connection.ExecuteAsync("""
                    INSERT INTO dbo.ProductStateHistory
                        (product_state_history_id, product_export_track_id, state, edition_number,
                         update_number, owner, occurred_at_utc, error_code, error_message)
                    SELECT TOP (1) @Id, product_export_track_id, state, published_edition,
                        published_update, N'BE108A verification', SYSUTCDATETIME(), NULL, NULL
                    FROM dbo.ProductExportTrack
                    ORDER BY updated_at_utc DESC, product_export_track_id DESC;
                    """, new { Id = insertedStateRecordId }, transaction);

                Assert.Equal(insertedStateRecordId, await connection.QuerySingleAsync<Guid>(
                    "SELECT product_state_history_id FROM dbo.ProductStateHistory WHERE product_state_history_id = @Id",
                    new { Id = insertedStateRecordId }, transaction));
            }
            finally
            {
                transaction.Rollback();
            }
        }

        Assert.Equal(0, await connection.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE product_state_history_id = @Id",
            new { Id = insertedStateRecordId }));

        var datasetName = "101ZZ" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        var operationId = Guid.NewGuid();
        var pendingOperationId = Guid.NewGuid();
        var states = new InMemoryProductRepository();
        await states.AppendAsync(datasetName, ProductState.ReadyForDistribution, "S-101", 5, 0);
        var publicStateRecordId = Assert.Single(await states.GetHistoryByNameAsync(datasetName)).Id;
        output.WriteLine($"Verification DatasetName: {datasetName}; StateRecordId: {publicStateRecordId}");
        output.WriteLine($"Cleanup OperationIds: {operationId}, {pendingOperationId}");

        try
        {
            var input = new ProductHistoryEventStart(operationId, "  " + datasetName.ToLowerInvariant() + "  ", "Export");
            await service.CreatePendingAsync(input);
            await service.CreatePendingAsync(input with { OperationId = pendingOperationId });
            Assert.Empty(await service.GetFinalizedByDatasetNameAsync(datasetName));
            Assert.Equal(datasetName, (await repository.GetByOperationIdAsync(operationId))!.DatasetName);

            var duplicate = await Assert.ThrowsAsync<SqlException>(() => service.CreatePendingAsync(input));
            Assert.Contains(duplicate.Number, new[] { 2601, 2627 });

            Assert.True(await service.FinalizeAsync(new(operationId, ProductHistoryResult.Succeeded, publicStateRecordId)));
            Assert.Single(await service.GetFinalizedByDatasetNameAsync(datasetName.ToLowerInvariant()));
            Assert.Empty(await service.GetFinalizedByDatasetNameAsync(datasetName + "X"));

            using var cache = new MemoryCache(new MemoryCacheOptions());
            var controller = ProductHistoryControllerTests.CreateController(cache, states, service, datasetName);
            var response = Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<OkObjectResult>(
                await controller.GetElectronicProductHistory(datasetName)).Value);
            Assert.Single(response.Data!);
            Assert.Single(response.Events);
            Assert.Equal(1, response.EventTotalHits);
            Assert.Equal(operationId, response.Events[0].OperationId);
            Assert.Equal(publicStateRecordId, response.Events[0].StateRecordId);
        }
        finally
        {
            await connection.ExecuteAsync("""
                DELETE FROM dbo.ProductHistoryEvent
                WHERE OperationId IN @OperationIds AND DatasetName = @DatasetName
                """, new { OperationIds = new[] { operationId, pendingOperationId }, DatasetName = datasetName });
        }
    }
}

public sealed class DatabaseOwnerFactAttribute : FactAttribute
{
    public DatabaseOwnerFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("BE108A_DATABASE_OWNER_VERIFY") != "1" ||
            string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("BE108A_SYSTEM_CONNECTION_FILE")))
            Skip = "Database-owner opt-in and the actual System connection file are required. See migration README.";
    }
}
