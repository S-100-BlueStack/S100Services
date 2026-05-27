using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using Serilog;

namespace ProductCatalogueAPI.Data.Repositories;

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

        var count = await conn.ExecuteAsync(
            closeSql,
            new { Name = name, Now = now, MaxDate },
            transaction);

        Log.Information("Existing record expired {expired}", (count == 1));

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

    public async Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName) {
        using var connection = _connectionFactory.Create();

        var sql = """
        SELECT TOP 1 last_successful_run_utc
        FROM dbo.JobRunState
        WHERE job_name = @JobName
        ORDER BY id DESC
    """;

        return await connection.QueryFirstOrDefaultAsync<DateTime?>(
            sql,
            new { JobName = jobName });
    }

    public async Task SetSuccessfulRunUtcAsync(
        string jobName,
        DateTime lastSuccessfulRunUtc) {
        using var connection = _connectionFactory.Create();

        var insertSql = """
        INSERT INTO dbo.JobRunState
        (job_name, last_successful_run_utc)
        VALUES
        (@JobName, @LastSuccessfulRunUtc)
    """;

        await connection.ExecuteAsync(
            insertSql,
            new {
                JobName = jobName,
                LastSuccessfulRunUtc = lastSuccessfulRunUtc,
            });
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

    public async Task<string[]> GetEligibleProductsAsync() {
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
            States = new[] { ProductState.NewUpdate, ProductState.Exported }
        });

        return [.. names];
    }
}

// In memory implementation for development and testing purposes.
public class InMemoryProductRepository : IProductRepository
{
    private readonly List<ProductRecord> _products = [];

    private static readonly DateTime MaxDate = new(9999, 12, 31);

    public Task AppendAsync(string name, ProductState state, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null) {
        _products.Add(new ProductRecord {
            Name = name,
            State = state,
            Owner = owner,
            Date_From = DateTime.UtcNow,
            Date_to = MaxDate,
        });

        return Task.CompletedTask;
    }

    public Task<IEnumerable<ProductRecord>> GetCurrentAsync() {
        return Task.FromResult<IEnumerable<ProductRecord>>(_products);
    }

    public Task<ProductRecord?> GetCurrentByNameAsync(string name) {
        var product = _products.FirstOrDefault(x => x.Name == name);
        return Task.FromResult(product);
    }

    public Task<string[]> GetIneligbleProductsAsync() {
        return Task.FromResult(
            _products.Where(p => p.State == ProductState.Frozen || p.State == ProductState.InTransit)
                     .Select(p => p.Name)
                     .ToArray());
    }

    public Task<string[]> GetEligibleProductsAsync() {
        return Task.FromResult(
            _products.Where(p => p.State == ProductState.Exported || p.State == ProductState.NewUpdate)
                     .Select(p => p.Name)
                     .ToArray());
    }


    public Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime) {
        return Task.CompletedTask;
    }

    Task<DateTime?> IProductRepository.GetLastSuccessfulRunUtcAsync(string jobName) {
        throw new NotImplementedException();
    }
}