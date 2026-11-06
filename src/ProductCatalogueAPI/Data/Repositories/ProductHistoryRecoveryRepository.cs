using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.History;

namespace ProductCatalogueAPI.Data.Repositories;

public interface IProductHistoryRecoveryRepository
{
    Task<IReadOnlyList<ProductHistoryEventRecord>> GetPendingPageAsync(DateTime beforeUtc, DateTime? afterCreatedUtc, Guid? afterId, CancellationToken cancellationToken);
    Task<bool> HasExactCompletionAsync(ProductHistoryTerminal terminal);
}

/// <summary>Read-only recovery evidence. It cannot execute or alter a Product workflow.</summary>
public sealed class ProductHistoryRecoveryRepository(DbConnectionFactory connectionFactory) : IProductHistoryRecoveryRepository
{
    public async Task<IReadOnlyList<ProductHistoryEventRecord>> GetPendingPageAsync(DateTime beforeUtc, DateTime? afterCreatedUtc, Guid? afterId, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<ProductHistoryEventRecord>(new CommandDefinition("""
            SELECT TOP (100) * FROM dbo.ProductHistoryEvent
            WHERE FinalizedAtUtc IS NULL AND UpdatedAtUtc < @BeforeUtc AND EventType = 'Export'
              AND (@AfterCreatedUtc IS NULL OR CreatedAtUtc > @AfterCreatedUtc
                   OR (CreatedAtUtc = @AfterCreatedUtc AND Id > @AfterId))
            ORDER BY CreatedAtUtc, Id;
            """, new { BeforeUtc = beforeUtc, AfterCreatedUtc = afterCreatedUtc, AfterId = afterId }, cancellationToken: cancellationToken));
        return rows.ToArray();
    }

    public async Task<bool> HasExactCompletionAsync(ProductHistoryTerminal terminal) {
        using var connection = connectionFactory.Create();
        var state = await connection.QuerySingleOrDefaultAsync<ProductHistoryCompletionRow>("""
            SELECT h.product_state_history_id AS Id, p.dataset_name AS DatasetName,
                   t.product_specification AS ExportTarget, h.state AS State,
                   h.edition_number AS Edition, h.update_number AS [Update]
            FROM dbo.ProductStateHistory h
            INNER JOIN dbo.ProductExportTrack t ON t.product_export_track_id = h.product_export_track_id
            INNER JOIN dbo.Product p ON p.product_id = t.product_id
            WHERE h.product_state_history_id = @StateRecordId
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.ProductHistoryEvent e
                  WHERE e.StateRecordId = h.product_state_history_id AND e.OperationId <> @OperationId
              );
            """, new { terminal.StateRecordId, terminal.OperationId });
        return state is not null && state.Id == terminal.StateRecordId &&
            ProductHistoryEventContract.NormalizeDatasetName(state.DatasetName) == terminal.DatasetName &&
            state.ExportTarget == terminal.ExportTarget && state.State == ProductState.ReadyForDistribution &&
            state.Edition == terminal.ResultEdition && state.Update == terminal.ResultUpdate;
    }

    private sealed class ProductHistoryCompletionRow
    {
        public Guid Id { get; set; }
        public string DatasetName { get; set; } = string.Empty;
        public string ExportTarget { get; set; } = string.Empty;
        public ProductState State { get; set; }
        public int Edition { get; set; }
        public int Update { get; set; }
    }
}
