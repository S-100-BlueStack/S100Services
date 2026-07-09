using Dapper;
using ProductManagerAPI.Data.Database;
using ProductManagerAPI.Data.Models;
using Serilog;

namespace ProductManagerAPI.Data.Repositories;

public class ProductRepository(DbConnectionFactory connectionFactory) : IProductRepository
{
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;
    private static readonly DateTime MaxDate = new(9999, 12, 31);

    public async Task AppendAsync(
        string name,
        ProductState state,
        string productSpecification,
        int editionNo,
        int updateNo,
        string? owner = null,
        byte[]? attachment = null,
        string? attachmentFileName = null)
    {
        using var conn = _connectionFactory.Create();
        conn.Open();
        using var transaction = conn.BeginTransaction();

        var now = DateTime.UtcNow;

        // Close the previous open-ended version before inserting the new state snapshot.
        var closeSql = """
            UPDATE dbo.JobTable
            SET date_to = @Now
            WHERE name = @Name
              AND date_to = @MaxDate
            """;

        var count = await conn.ExecuteAsync(
            closeSql,
            new { Name = name, Now = now, MaxDate },
            transaction);

        Log.Information("Existing record expired {expired}", count == 1);

        var insertSql = """
            INSERT INTO dbo.JobTable
                (name, state, product_specification, edition_number, update_number, owner, date_from, date_to, attachment, attachment_file_name)
            VALUES
                (@Name, @State, @ProductSpecification, @EditionNo, @UpdateNo, @Owner, @DateFrom, @DateTo, @Attachment, @AttachmentFileName)
            """;

        await conn.ExecuteAsync(
            insertSql,
            new
            {
                Name = name,
                State = state,
                ProductSpecification = productSpecification,
                EditionNo = editionNo,
                UpdateNo = updateNo,
                Owner = owner,
                DateFrom = now,
                DateTo = MaxDate,
                Attachment = attachment,
                AttachmentFileName = attachmentFileName
            },
            transaction);

        transaction.Commit();
    }

    public async Task<IEnumerable<ProductRecord>> GetCurrentAsync()
    {
        using var connection = _connectionFactory.Create();

        var sql = """
            SELECT
                id AS Id,
                name AS Name,
                state AS State,
                product_specification AS ProductSpecification,
                edition_number AS EditionNo,
                update_number AS UpdateNo,
                owner AS Owner,
                date_from AS Date_From,
                date_to AS Date_to
            FROM dbo.JobTable
            WHERE date_to = (
                SELECT MAX(date_to)
                FROM dbo.JobTable AS q2
                WHERE q2.name = dbo.JobTable.name
            )
            """;

        return await connection.QueryAsync<ProductRecord>(sql);
    }

    public async Task<ProductRecord?> GetCurrentByNameAsync(string name)
    {
        using var connection = _connectionFactory.Create();

        var sql = """
            SELECT TOP 1
                id AS Id,
                name AS Name,
                state AS State,
                product_specification AS ProductSpecification,
                edition_number AS EditionNo,
                update_number AS UpdateNo,
                owner AS Owner,
                date_from AS Date_From,
                date_to AS Date_to
            FROM dbo.JobTable
            WHERE name = @Name
            ORDER BY date_from DESC
            """;

        return await connection.QueryFirstOrDefaultAsync<ProductRecord>(
            sql,
            new { Name = name });
    }

    public async Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName)
    {
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

    public async Task SetSuccessfulRunUtcAsync(string jobName, DateTime lastSuccessfulRunUtc)
    {
        using var connection = _connectionFactory.Create();

        var insertSql = """
            INSERT INTO dbo.JobRunState (job_name, last_successful_run_utc)
            VALUES (@JobName, @LastSuccessfulRunUtc)
            """;

        await connection.ExecuteAsync(
            insertSql,
            new
            {
                JobName = jobName,
                LastSuccessfulRunUtc = lastSuccessfulRunUtc,
            });
    }

    public async Task<string[]> GetIneligbleProductsAsync()
    {
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

        var names = await connection.QueryAsync<string>(
            sql,
            new { States = new[] { ProductState.Frozen, ProductState.InTransit } });

        return [.. names];
    }

    public async Task<string[]> GetEligibleProductsAsync()
    {
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

        var names = await connection.QueryAsync<string>(
            sql,
            new { States = new[] { ProductState.Exported } });

        return [.. names];
    }

    public async Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name)
    {
        using var connection = _connectionFactory.Create();

        var sql = """
            SELECT
                id AS Id,
                name AS Name,
                state AS State,
                product_specification AS ProductSpecification,
                edition_number AS EditionNo,
                update_number AS UpdateNo,
                owner AS Owner,
                date_from AS Date_From,
                date_to AS Date_to
            FROM dbo.JobTable
            WHERE name = @Name
            ORDER BY date_from DESC
            """;

        return await connection.QueryAsync<ProductRecord>(
            sql,
            new { Name = name });
    }

    public async Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive)
    {
        using var connection = _connectionFactory.Create();

        var sql = """
            SELECT
                id AS Id,
                name AS Name,
                state AS State,
                product_specification AS ProductSpecification,
                edition_number AS EditionNo,
                update_number AS UpdateNo,
                owner AS Owner,
                date_from AS Date_From,
                date_to AS Date_to
            FROM dbo.JobTable
            WHERE date_from >= @FromInclusive
              AND date_from < @ToExclusive
            ORDER BY date_from DESC
            """;

        return await connection.QueryAsync<ProductRecord>(
            sql,
            new { FromInclusive = fromInclusive, ToExclusive = toExclusive });
    }
}

// In memory implementation for development and testing purposes.
public class InMemoryProductRepository : IProductRepository
{
    private readonly List<ProductRecord> _products = [];
    private readonly Dictionary<string, DateTime> _lastSuccessfulRuns = new(StringComparer.OrdinalIgnoreCase);
    private static readonly DateTime MaxDate = new(9999, 12, 31);

    public Task AppendAsync(
        string name,
        ProductState state,
        string productSpecification,
        int editionNo,
        int updateNo,
        string? owner = null,
        byte[]? attachment = null,
        string? attachmentFileName = null)
    {
        var now = DateTime.UtcNow;

        foreach (var product in _products.Where(p => p.Name == name && p.Date_to == MaxDate))
        {
            product.Date_to = now;
        }

        _products.Add(new ProductRecord
        {
            Id = Guid.NewGuid(),
            Name = name,
            State = state,
            ProductSpecification = productSpecification,
            EditionNo = editionNo,
            UpdateNo = updateNo,
            Owner = owner,
            Date_From = now,
            Date_to = MaxDate,
        });

        return Task.CompletedTask;
    }

    public Task<IEnumerable<ProductRecord>> GetCurrentAsync()
    {
        var records = _products
            .GroupBy(p => p.Name)
            .Select(group => group.OrderByDescending(p => p.Date_From).First())
            .AsEnumerable();

        return Task.FromResult(records);
    }

    public Task<ProductRecord?> GetCurrentByNameAsync(string name)
    {
        var product = _products
            .Where(x => x.Name == name)
            .OrderByDescending(x => x.Date_From)
            .FirstOrDefault();

        return Task.FromResult(product);
    }

    public Task<string[]> GetIneligbleProductsAsync()
    {
        var names = _products
            .GroupBy(p => p.Name)
            .Select(group => group.OrderByDescending(p => p.Date_From).First())
            .Where(p => p.State == ProductState.Frozen || p.State == ProductState.InTransit)
            .Select(p => p.Name)
            .ToArray();

        return Task.FromResult(names);
    }

    public Task<string[]> GetEligibleProductsAsync()
    {
        var names = _products
            .GroupBy(p => p.Name)
            .Select(group => group.OrderByDescending(p => p.Date_From).First())
            .Where(p => p.State != ProductState.Exported)
            .Select(p => p.Name)
            .ToArray();

        return Task.FromResult(names);
    }

    public Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime)
    {
        _lastSuccessfulRuns[jobName] = dateTime;

        return Task.CompletedTask;
    }

    public Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName)
    {
        return Task.FromResult(
            _lastSuccessfulRuns.TryGetValue(jobName, out var dateTime)
                ? dateTime
                : (DateTime?)null);
    }

    public Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name)
    {
        var records = _products
            .Where(product => product.Name == name)
            .OrderByDescending(product => product.Date_From)
            .AsEnumerable();

        return Task.FromResult(records);
    }

    public Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive)
    {
        var records = _products
            .Where(product => product.Date_From >= fromInclusive && product.Date_From < toExclusive)
            .OrderByDescending(product => product.Date_From)
            .AsEnumerable();

        return Task.FromResult(records);
    }
}
