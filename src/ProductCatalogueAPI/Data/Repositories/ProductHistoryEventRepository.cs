using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

public sealed class ProductHistoryEventRepository(DbConnectionFactory connectionFactory) : IProductHistoryEventRepository
{
    public async Task InsertPendingAsync(ProductHistoryEventRecord record)
    {
        using var connection = connectionFactory.Create();
        // The unique OperationId constraint rejects duplicate logical operations.
        await connection.ExecuteAsync("""
            INSERT INTO dbo.ProductHistoryEvent
                (Id, OperationId, DatasetName, EventType, JobId, CorrelationId, ExportTarget,
                 OperationMetadataJson, CreatedAtUtc, UpdatedAtUtc)
            VALUES
                (@Id, @OperationId, @DatasetName, @EventType, @JobId, @CorrelationId, @ExportTarget,
                 @OperationMetadataJson, @CreatedAtUtc, @UpdatedAtUtc)
            """, record);
    }

    public async Task<ProductHistoryEventRecord?> GetByOperationIdAsync(Guid operationId)
    {
        using var connection = connectionFactory.Create();
        return await connection.QuerySingleOrDefaultAsync<ProductHistoryEventRecord>("""
            SELECT * FROM dbo.ProductHistoryEvent WHERE OperationId = @OperationId
            """, new { OperationId = operationId });
    }

    public async Task<bool> MarkExecutionStartedAsync(Guid operationId, DateTime nowUtc)
    {
        using var connection = connectionFactory.Create();
        return await connection.ExecuteAsync("""
            UPDATE dbo.ProductHistoryEvent
            SET ExecutionStartedAtUtc = CASE WHEN @NowUtc < UpdatedAtUtc THEN UpdatedAtUtc ELSE @NowUtc END,
                UpdatedAtUtc = CASE WHEN @NowUtc < UpdatedAtUtc THEN UpdatedAtUtc ELSE @NowUtc END
            WHERE OperationId = @OperationId AND FinalizedAtUtc IS NULL AND ExecutionStartedAtUtc IS NULL
            """, new { OperationId = operationId, NowUtc = nowUtc }) == 1;
    }

    public async Task<bool> TryFinalizeAsync(ProductHistoryEventRecord record)
    {
        using var connection = connectionFactory.Create();
        // A terminal row is immutable. This guards audit transitions, not business ownership.
        return await connection.ExecuteAsync("""
            UPDATE dbo.ProductHistoryEvent
            SET Outcome = @Outcome, Code = @Code, SafeMessage = @SafeMessage,
                StateRecordId = @StateRecordId, OperationMetadataJson = @OperationMetadataJson,
                FinalizedAtUtc = CASE WHEN @FinalizedAtUtc < UpdatedAtUtc THEN UpdatedAtUtc ELSE @FinalizedAtUtc END,
                OccurredAtUtc = CASE WHEN @OccurredAtUtc < UpdatedAtUtc THEN UpdatedAtUtc ELSE @OccurredAtUtc END,
                UpdatedAtUtc = CASE WHEN @UpdatedAtUtc < UpdatedAtUtc THEN UpdatedAtUtc ELSE @UpdatedAtUtc END
            WHERE Id = @Id AND OperationId = @OperationId AND FinalizedAtUtc IS NULL
            """, record) == 1;
    }

    public async Task<IReadOnlyList<ProductHistoryEventRecord>> GetFinalizedByDatasetNameAsync(string canonicalDatasetName)
    {
        using var connection = connectionFactory.Create();
        // Equality seeks the name index. The binary residual prevents collation-dependent
        // accent/width/trailing-space equivalence without changing database collation.
        var rows = await connection.QueryAsync<ProductHistoryEventRecord>("""
            SELECT * FROM dbo.ProductHistoryEvent
            WHERE DatasetName = @DatasetName
              AND CONVERT(varbinary(512), DatasetName) = CONVERT(varbinary(512), @DatasetName)
              AND FinalizedAtUtc IS NOT NULL
            ORDER BY OccurredAtUtc DESC, Id DESC
            """, new { DatasetName = canonicalDatasetName });
        return rows.ToArray();
    }
}
