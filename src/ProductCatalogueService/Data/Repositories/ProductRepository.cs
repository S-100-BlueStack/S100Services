using Dapper;
using ProductCatalogueService.Data.Database;
using ProductCatalogueService.Data.Models;

namespace ProductCatalogueService.Data.Repositories;

public class ProductRepository(DbConnectionFactory connectionFactory) : IProductRepository
{
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;

    private static readonly DateTime MaxDate = new(9999, 12, 31);

    public async Task AppendAsync(string name, ProductState state, string? owner = null) {
        using var conn = _connectionFactory.Create();
        conn.Open();
        using var transaction = conn.BeginTransaction();

        var now = DateTime.UtcNow;

        // expire current version
        var closeSql = """
            UPDATE dbo.JobTable
            SET date_to = @Now

            WHERE name = @name
            AND date_to = @MaxDate
        """;

        await conn.ExecuteAsync(
            closeSql,
            new { Name = name, Now = now, MaxDate },
            transaction);

        // insert new version
        var insertSql = """
            INSERT INTO dbo.JobTable
            (name, state, owner, date_from, date_to)
            VALUES
            (@Name, @State, @Owner, @DateFrom, @DateTo)
        """;

        await conn.ExecuteAsync(
            insertSql,
            new {
                Name = name,
                State = state,
                Owner = owner,
                DateFrom = now,
                DateTo = MaxDate
            },
            transaction);

        transaction.Commit();
    }

    public async Task<IEnumerable<ProductRecord>> GetCurrentAsync() {
        using var connection = _connectionFactory.Create();
        var sql = """
            SELECT id, name, state, owner, date_from, date_to
            FROM dbo.JobTable
            WHERE date_to = (
                SELECT MAX(date_to)
                FROM dbo.JobTable AS inner
                WHERE inner.name = dbo.JobTable.name
            )
        """;
        return await connection.QueryAsync<ProductRecord>(sql);
    }

    public async Task<ProductRecord?> GetCurrentByNameAsync(string name) {
        using var connection = _connectionFactory.Create();

        var sql = """
            SELECT TOP 1 id, name, state, owner, date_from, date_to
            FROM dbo.JobTable
            WHERE name = @Name
            ORDER BY date_from DESC
        """;

        return await connection.QueryFirstOrDefaultAsync<ProductRecord>(
            sql,
            new { Name = name });
    }
}