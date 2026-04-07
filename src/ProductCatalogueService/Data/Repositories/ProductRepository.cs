using Dapper;
using ProductCatalogueService.Data.Database;
using ProductCatalogueService.Data.Models;

namespace ProductCatalogueService.Data.Repositories;

public class ProductRepository(DbConnectionFactory connectionFactory) : IProductRepository
{
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;

    private static readonly DateTime MaxDate = new(9999, 12, 31);

    public async Task AppendAsync(string name, ProductState state, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null) {
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
            (name, state, owner, date_from, date_to, attachment, attachment_file_name)
            VALUES
            (@Name, @State, @Owner, @DateFrom, @DateTo, @Attachment, @AttachmentFileName)
        """;

        await conn.ExecuteAsync(
            insertSql,
            new {
                Name = name,
                State = state,
                Owner = owner,
                DateFrom = now,
                DateTo = MaxDate,
                Attachment = attachment,
                AttachmentFileName = attachmentFileName
            },
            transaction);

        transaction.Commit();
    }

    public async Task<IEnumerable<ProductRecord>> GetCurrentAsync() {
        using var connection = _connectionFactory.Create();
        var sql = """
            SELECT id, name, state, owner, date_from, date_to, attachment, attachment_file_name
            FROM dbo.JobTable
            WHERE date_to = (
                SELECT MAX(date_to)
                FROM dbo.JobTable AS q2
                WHERE q2.name = dbo.JobTable.name
            )
        """;
        return await connection.QueryAsync<ProductRecord>(sql);
    }

    public async Task<ProductRecord?> GetCurrentByNameAsync(string name) {
        using var connection = _connectionFactory.Create();

        var sql = """
            SELECT TOP 1 id, name, state, owner, date_from, date_to, attachment, attachment_file_name
            FROM dbo.JobTable
            WHERE name = @Name
            ORDER BY date_from DESC
        """;

        return await connection.QueryFirstOrDefaultAsync<ProductRecord>(
            sql,
            new { Name = name });
    }

    public async Task<string[]> GetIneligbleProductsAsync() {
        using var connection = _connectionFactory.Create();

        var sql = """
            SELECT name
            FROM (
                SELECT
                    name,
                    state,
                    ROW_NUMBER() OVER (PARTITION BY name ORDER BY date_to DESC) AS rn
                FROM dbo.JobTable
            ) t
            WHERE rn = 1
            AND state NOT IN @States
        """;

        var names = await connection.QueryAsync<string>(sql, new {
            States = new[] { ProductState.Frozen, ProductState.InTransit }
        });

        return [.. names];
    }
}