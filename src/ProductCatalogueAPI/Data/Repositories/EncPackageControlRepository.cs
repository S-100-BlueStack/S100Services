using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using System.Data;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Owns source-scoped ENC Pause persistence. Existing EncPackage rows remain disposable
/// candidate snapshots; their replacement does not clear the source's delivery policy.
/// </summary>
public sealed class EncPackageControlRepository(DbConnectionFactory connectionFactory) : IEncPackageControlRepository
{
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;

    /// <inheritdoc/>
    public async Task<EncPackageControlState?> GetForPackageAsync(Guid packageId, CancellationToken cancellationToken = default) {
        if (packageId == Guid.Empty)
            throw new ArgumentException("A current package snapshot identifier is required.", nameof(packageId));

        using var connection = _connectionFactory.Create();
        var state = await connection.QuerySingleOrDefaultAsync<EncPackageControlState>(
            new CommandDefinition(SelectActiveControlSql, new { PackageId = packageId }, cancellationToken: cancellationToken));
        NormalizeUtc(state);
        return state;
    }

    /// <inheritdoc/>
    public async Task<EncPackagePauseWriteResult> TrySetPausedAsync(
        Guid expectedPackageId,
        byte[]? expectedControlVersion,
        bool isPaused,
        DateTime changedAtUtc,
        CancellationToken cancellationToken = default) {
        if (expectedPackageId == Guid.Empty)
            throw new ArgumentException("A current package snapshot identifier is required.", nameof(expectedPackageId));
        if (changedAtUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Pause persistence requires a UTC timestamp.", nameof(changedAtUtc));
        if (expectedControlVersion is { Length: not 8 })
            throw new ArgumentException("A SQL Server rowversion must contain exactly eight bytes.", nameof(expectedControlVersion));

        using var connection = _connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        // The row lock makes the snapshot precondition mutually exclusive with deletion or
        // replacement through the existing EncPackage repository.
        var sourceName = await connection.QuerySingleOrDefaultAsync<string>(new CommandDefinition("""
            SELECT source_dataset_name FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK)
            WHERE package_id = @PackageId;
            """, new { PackageId = expectedPackageId }, transaction, cancellationToken: cancellationToken));
        if (sourceName is null)
            return new(EncPackagePauseWriteStatus.SnapshotNotFound, null);

        // Serializable range locking protects the first write to a source with no control row.
        var previous = await connection.QuerySingleOrDefaultAsync<ControlRow>(new CommandDefinition("""
            SELECT is_paused AS IsPaused, row_version AS RowVersion
            FROM dbo.EncPackageControl WITH (UPDLOCK, HOLDLOCK)
            WHERE source_dataset_name = @SourceDatasetName;
            """, new { SourceDatasetName = sourceName }, transaction, cancellationToken: cancellationToken));

        if (!MatchesVersion(previous?.RowVersion, expectedControlVersion))
            return new(EncPackagePauseWriteStatus.VersionConflict, null);

        var changed = previous is null ? isPaused : previous.IsPaused != isPaused;
        if (changed) {
            if (previous is null) {
                await connection.ExecuteAsync(new CommandDefinition("""
                    INSERT INTO dbo.EncPackageControl
                        (source_dataset_name, is_paused, paused_at_utc, updated_at_utc)
                    VALUES (@SourceDatasetName, @IsPaused, @PausedAtUtc, @UpdatedAtUtc);
                    """, new {
                        SourceDatasetName = sourceName,
                        IsPaused = isPaused,
                        PausedAtUtc = isPaused ? changedAtUtc : (DateTime?)null,
                        UpdatedAtUtc = changedAtUtc
                    }, transaction, cancellationToken: cancellationToken));
            }
            else {
                var affected = await connection.ExecuteAsync(new CommandDefinition("""
                    UPDATE dbo.EncPackageControl
                    SET is_paused = @IsPaused, paused_at_utc = @PausedAtUtc,
                        updated_at_utc = @UpdatedAtUtc
                    WHERE source_dataset_name = @SourceDatasetName AND row_version = @ExpectedVersion;
                    """, new {
                        SourceDatasetName = sourceName,
                        IsPaused = isPaused,
                        PausedAtUtc = isPaused ? changedAtUtc : (DateTime?)null,
                        UpdatedAtUtc = changedAtUtc,
                        ExpectedVersion = expectedControlVersion
                    }, transaction, cancellationToken: cancellationToken));
                if (affected != 1)
                    return new(EncPackagePauseWriteStatus.VersionConflict, null);
            }
        }

        var state = await connection.QuerySingleOrDefaultAsync<EncPackageControlState>(
            new CommandDefinition(SelectActiveControlSql, new { PackageId = expectedPackageId }, transaction, cancellationToken: cancellationToken));
        if (state is null)
            throw new InvalidOperationException("The current ENC package snapshot disappeared during its control transaction.");
        NormalizeUtc(state);
        transaction.Commit();
        return new(changed ? EncPackagePauseWriteStatus.Changed : EncPackagePauseWriteStatus.Unchanged, state);
    }

    private static bool MatchesVersion(byte[]? current, byte[]? expected) =>
        current is null ? expected is null : expected is not null && current.AsSpan().SequenceEqual(expected);

    private static void NormalizeUtc(EncPackageControlState? state) {
        if (state?.PausedAtUtc is DateTime paused)
            state.PausedAtUtc = DateTime.SpecifyKind(paused, DateTimeKind.Utc);
        if (state?.UpdatedAtUtc is DateTime updated)
            state.UpdatedAtUtc = DateTime.SpecifyKind(updated, DateTimeKind.Utc);
    }

    private const string SelectActiveControlSql = """
        SELECT p.package_id AS PackageId, p.source_dataset_name AS SourceDatasetName,
               COALESCE(c.is_paused, CONVERT(bit, 0)) AS IsPaused,
               c.paused_at_utc AS PausedAtUtc, c.updated_at_utc AS UpdatedAtUtc,
               c.row_version AS RowVersion
        FROM dbo.EncPackage p
        LEFT JOIN dbo.EncPackageControl c ON c.source_dataset_name = p.source_dataset_name
        WHERE p.package_id = @PackageId;
        """;

    private sealed class ControlRow
    {
        public bool IsPaused { get; set; }
        public byte[] RowVersion { get; set; } = [];
    }
}
