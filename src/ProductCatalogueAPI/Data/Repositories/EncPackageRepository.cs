using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using System.Data;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Stores active ENC source snapshots independently of S-128 catalogue data.</summary>
public sealed class EncPackageRepository(DbConnectionFactory connectionFactory) : IEncPackageRepository
{
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;

    /// <inheritdoc/>
    public async Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames, CancellationToken cancellationToken = default, bool includeSourceYaml = true) {
        var names = sourceDatasetNames.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (names.Length == 0)
            return new Dictionary<string, EncPackage>(StringComparer.OrdinalIgnoreCase);

        using var connection = _connectionFactory.Create();
        var result = new Dictionary<string, EncPackage>(StringComparer.OrdinalIgnoreCase);
        foreach (var batch in names.Chunk(1000)) {
            var projection = includeSourceYaml ? SelectSql : SelectHeaderSql;
            var rows = await connection.QueryAsync<EncPackage>(new CommandDefinition($"{projection} WHERE source_dataset_name IN @Names", new { Names = batch }, cancellationToken: cancellationToken));
            foreach (var row in rows) {
                row.ScanFromUtc = DateTime.SpecifyKind(row.ScanFromUtc, DateTimeKind.Utc);
                row.DetectedAtUtc = DateTime.SpecifyKind(row.DetectedAtUtc, DateTimeKind.Utc);
                result.Add(row.SourceDatasetName, row);
            }
        }
        return result;
    }

    /// <inheritdoc/>
    public async Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        return await connection.QuerySingleOrDefaultAsync<DateTime?>(new CommandDefinition("SELECT MIN(scan_from_utc) FROM dbo.EncPackageReplay;", cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var rows = await connection.QueryAsync<ReplayRow>(new CommandDefinition("SELECT source_dataset_name AS SourceDatasetName, scan_from_utc AS ScanFromUtc FROM dbo.EncPackageReplay;", cancellationToken: cancellationToken));
        return rows.ToDictionary(row => row.SourceDatasetName, row => DateTime.SpecifyKind(row.ScanFromUtc, DateTimeKind.Utc), StringComparer.OrdinalIgnoreCase);
    }

    /// <inheritdoc/>
    public async Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        await UpsertReplayAsync(connection, transaction, sourceDatasetName, scanFromUtc, cancellationToken);
        transaction.Commit();
    }

    /// <inheritdoc/>
    public async Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var affected = await connection.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.EncPackage (package_id, source_dataset_name, s57_dataset_name, scan_from_utc, detected_at_utc, dataset_yaml, summary_yaml, error_message)
            SELECT @Id, @SourceDatasetName, @S57DatasetName, @ScanFromUtc, @DetectedAtUtc, @DatasetYaml, @SummaryYaml, @ErrorMessage
            WHERE NOT EXISTS (SELECT 1 FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK) WHERE source_dataset_name = @SourceDatasetName);
            """, package, transaction, cancellationToken: cancellationToken));
        if (affected == 1)
            await connection.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.EncPackageReplay WHERE source_dataset_name = @SourceDatasetName;", new { package.SourceDatasetName }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
        return affected == 1;
    }

    /// <inheritdoc/>
    public async Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var affected = await connection.ExecuteAsync(new CommandDefinition("UPDATE dbo.EncPackage SET error_message = @Message WHERE package_id = @PackageId;", new { PackageId = packageId, Message = message[..Math.Min(message.Length, 1024)] }, cancellationToken: cancellationToken));
        if (affected != 1)
            throw new InvalidOperationException($"ENC package '{packageId}' was not available to record its export failure.");
    }

    /// <inheritdoc/>
    public async Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default) {
        if (specification is not (ProductSpecification.S57 or ProductSpecification.S101))
            throw new ArgumentOutOfRangeException(nameof(specification));

        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var where = specification == ProductSpecification.S57 ? "s57_dataset_name" : "source_dataset_name";
        var flag = specification == ProductSpecification.S57 ? "s57_discarded" : "s101_discarded";
        // The identifiers are selected exclusively from the two fixed enum cases above.
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition($"{SelectHeaderSql} WITH (UPDLOCK, HOLDLOCK) WHERE {where} = @DatasetName", new { DatasetName = datasetName }, transaction, cancellationToken: cancellationToken));
        if (package is null)
            throw new InvalidOperationException("No active ENC package contains this export.");

        await connection.ExecuteAsync(new CommandDefinition($"UPDATE dbo.EncPackage SET {flag} = 1, error_message = NULL WHERE package_id = @Id", new { package.Id }, transaction, cancellationToken: cancellationToken));
        if ((specification == ProductSpecification.S57 || package.S57Discarded) && (specification == ProductSpecification.S101 || package.S101Discarded)) {
            await UpsertReplayAsync(connection, transaction, package.SourceDatasetName, package.ScanFromUtc, cancellationToken);
            await connection.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.EncPackage WHERE package_id = @Id", new { package.Id }, transaction, cancellationToken: cancellationToken));
        }
        transaction.Commit();
    }

    /// <inheritdoc/>
    public async Task ReleaseAcceptedAsync(CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var completed = await connection.QueryAsync<EncPackage>(new CommandDefinition($"""
            {SelectHeaderSql} p WITH (UPDLOCK, HOLDLOCK)
            WHERE (p.s57_discarded = 1 OR EXISTS (
                SELECT 1 FROM dbo.ProductExportTrack t JOIN dbo.Product product ON product.product_id = t.product_id
                WHERE product.dataset_name = p.s57_dataset_name AND t.product_specification = 'S57' AND t.state = 13))
              AND (p.s101_discarded = 1 OR EXISTS (
                SELECT 1 FROM dbo.ProductExportTrack t JOIN dbo.Product product ON product.product_id = t.product_id
                WHERE product.dataset_name = p.source_dataset_name AND t.product_specification = 'S101' AND t.state = 13));
            """, transaction: transaction, cancellationToken: cancellationToken));
        foreach (var package in completed) {
            await UpsertReplayAsync(connection, transaction, package.SourceDatasetName, package.DetectedAtUtc, cancellationToken);
            await connection.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.EncPackage WHERE package_id = @Id", new { package.Id }, transaction, cancellationToken: cancellationToken));
        }
        transaction.Commit();
    }

    private static Task UpsertReplayAsync(IDbConnection connection, IDbTransaction transaction, string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken) => connection.ExecuteAsync(new CommandDefinition("""
        UPDATE dbo.EncPackageReplay WITH (UPDLOCK, HOLDLOCK)
        SET scan_from_utc = CASE WHEN scan_from_utc < @ScanFromUtc THEN scan_from_utc ELSE @ScanFromUtc END
        WHERE source_dataset_name = @SourceDatasetName;
        IF @@ROWCOUNT = 0
            INSERT INTO dbo.EncPackageReplay (source_dataset_name, scan_from_utc) VALUES (@SourceDatasetName, @ScanFromUtc);
        """, new { SourceDatasetName = sourceDatasetName, ScanFromUtc = scanFromUtc }, transaction, cancellationToken: cancellationToken));

    private const string SelectHeaderSql = """
        SELECT package_id AS Id, source_dataset_name AS SourceDatasetName, s57_dataset_name AS S57DatasetName,
               scan_from_utc AS ScanFromUtc, detected_at_utc AS DetectedAtUtc,
               s57_discarded AS S57Discarded, s101_discarded AS S101Discarded,
               error_message AS ErrorMessage FROM dbo.EncPackage
        """;

    private const string SelectSql = """
        SELECT package_id AS Id, source_dataset_name AS SourceDatasetName, s57_dataset_name AS S57DatasetName,
               scan_from_utc AS ScanFromUtc, detected_at_utc AS DetectedAtUtc, dataset_yaml AS DatasetYaml,
               summary_yaml AS SummaryYaml, s57_discarded AS S57Discarded, s101_discarded AS S101Discarded,
               error_message AS ErrorMessage FROM dbo.EncPackage
        """;

    private sealed class ReplayRow
    {
        public string SourceDatasetName { get; set; } = string.Empty;
        public DateTime ScanFromUtc { get; set; }
    }
}
