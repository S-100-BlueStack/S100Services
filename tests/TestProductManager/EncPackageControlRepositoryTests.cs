using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;

namespace TestProductCatalogueAPI;

public sealed class EncPackageControlRepositoryTests
{
    [Fact]
    public async Task PauseSurvivesReplacementOfTheActivePackageSnapshot()
    {
        using var connection = new RecordingConnection("ENC-SOURCE");
        var repository = new EncPackageControlRepository(new RecordingFactory(connection));
        var firstSnapshot = connection.PackageId;
        var before = await repository.GetForPackageAsync(firstSnapshot);

        Assert.NotNull(before);
        Assert.False(before.IsPaused);
        Assert.Null(before.RowVersion);

        var pausedAt = new DateTime(2026, 10, 9, 10, 0, 0, DateTimeKind.Utc);
        var applied = await repository.TrySetPausedAsync(firstSnapshot, before.RowVersion, true, pausedAt);

        Assert.Equal(EncPackagePauseWriteStatus.Changed, applied.Status);
        Assert.True(applied.State!.IsPaused);
        Assert.Equal(pausedAt, applied.State.PausedAtUtc);
        Assert.Equal(DateTimeKind.Utc, applied.State.PausedAtUtc!.Value.Kind);
        Assert.NotNull(applied.State.RowVersion);
        Assert.Equal(1, connection.Inserts);
        Assert.Equal(1, connection.Commits);
        Assert.All(connection.Writes, write => Assert.True(write.WithTransaction));

        // The detector replaces a package GUID but retains the same source identity.
        connection.PackageId = Guid.NewGuid();
        var replacement = await repository.GetForPackageAsync(connection.PackageId);
        Assert.NotNull(replacement);
        Assert.True(replacement.IsPaused);
        Assert.Equal(pausedAt, replacement.PausedAtUtc);
        Assert.Equal(connection.PackageId, replacement.PackageId);
        Assert.Null(await repository.GetForPackageAsync(firstSnapshot));
    }

    [Fact]
    public async Task AStaleSnapshotCannotChangeTheCurrentSourcesPausePolicy()
    {
        using var connection = new RecordingConnection("ENC-SOURCE");
        var repository = new EncPackageControlRepository(new RecordingFactory(connection));
        var staleId = connection.PackageId;
        connection.PackageId = Guid.NewGuid();

        var result = await repository.TrySetPausedAsync(staleId, null, true, DateTime.UtcNow);

        Assert.Equal(EncPackagePauseWriteStatus.SnapshotNotFound, result.Status);
        Assert.Null(result.State);
        Assert.Equal(0, connection.Inserts);
        Assert.Equal(0, connection.Updates);
        Assert.Equal(0, connection.Commits);
    }

    [Fact]
    public async Task AnOutdatedControlVersionCannotUndoANewerPause()
    {
        using var connection = new RecordingConnection("ENC-SOURCE");
        var repository = new EncPackageControlRepository(new RecordingFactory(connection));
        var id = connection.PackageId;
        var pausedAt = new DateTime(2026, 10, 9, 10, 0, 0, DateTimeKind.Utc);
        var pause = await repository.TrySetPausedAsync(id, null, true, pausedAt);

        var conflict = await repository.TrySetPausedAsync(id, null, false, pausedAt.AddMinutes(1));
        Assert.Equal(EncPackagePauseWriteStatus.VersionConflict, conflict.Status);
        Assert.Null(conflict.State);
        Assert.True((await repository.GetForPackageAsync(id))!.IsPaused);
        Assert.Equal(0, connection.Updates);

        var resumed = await repository.TrySetPausedAsync(id, pause.State!.RowVersion, false, pausedAt.AddMinutes(2));
        Assert.Equal(EncPackagePauseWriteStatus.Changed, resumed.Status);
        Assert.False(resumed.State!.IsPaused);
        Assert.Null(resumed.State.PausedAtUtc);
        Assert.NotEqual(pause.State.RowVersion, resumed.State.RowVersion);
        Assert.Equal(1, connection.Updates);
    }

    [Fact]
    public async Task UnpauseWithoutAnExistingControlRowIsANoOp()
    {
        using var connection = new RecordingConnection("ENC-SOURCE");
        var repository = new EncPackageControlRepository(new RecordingFactory(connection));

        var result = await repository.TrySetPausedAsync(connection.PackageId, null, false, DateTime.UtcNow);

        Assert.Equal(EncPackagePauseWriteStatus.Unchanged, result.Status);
        Assert.False(result.State!.IsPaused);
        Assert.Null(result.State.RowVersion);
        Assert.Equal(0, connection.Inserts);
        Assert.Equal(0, connection.Updates);
    }

    [Fact]
    public async Task PausePersistenceRequiresAnExactSnapshotAndUtcTime()
    {
        using var connection = new RecordingConnection("ENC-SOURCE");
        var repository = new EncPackageControlRepository(new RecordingFactory(connection));
        await Assert.ThrowsAsync<ArgumentException>(() => repository.GetForPackageAsync(Guid.Empty));
        await Assert.ThrowsAsync<ArgumentException>(() => repository.TrySetPausedAsync(Guid.Empty, null, true, DateTime.UtcNow));
        await Assert.ThrowsAsync<ArgumentException>(() => repository.TrySetPausedAsync(connection.PackageId, null, true, DateTime.Now));
        await Assert.ThrowsAsync<ArgumentException>(() => repository.TrySetPausedAsync(connection.PackageId, new byte[7], true, DateTime.UtcNow));
        Assert.Empty(connection.Commands);
    }

    private sealed class RecordingFactory(RecordingConnection connection) : DbConnectionFactory(new ConfigurationBuilder().Build())
    {
        public override IDbConnection Create() => connection;
    }

    private sealed record CapturedCommand(string Sql, bool WithTransaction);

    /// <summary>
    /// Focused ADO recording double: validates public repository behavior and transaction use.
    /// It does not prove SQL Server locking, index or constraint behavior.
    /// </summary>
    private sealed class RecordingConnection(string sourceName) : DbConnection
    {
        private readonly string _sourceName = sourceName;
        private bool _hasControl;
        private bool _paused;
        private DateTime? _pausedAt;
        private DateTime? _updatedAt;
        private ulong _version;

        public Guid PackageId { get; set; } = Guid.NewGuid();
        public int Inserts { get; private set; }
        public int Updates { get; private set; }
        public int Commits { get; private set; }
        public List<CapturedCommand> Commands { get; } = [];
        public IEnumerable<CapturedCommand> Writes => Commands.Where(c => c.Sql.StartsWith("INSERT", StringComparison.Ordinal) || c.Sql.StartsWith("UPDATE", StringComparison.Ordinal));

        [AllowNull]
        public override string ConnectionString { get; set; } = string.Empty;
        public override string Database => "Recording";
        public override string DataSource => "Recording";
        public override string ServerVersion => "1";
        public override ConnectionState State => ConnectionState.Open;
        public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
        public override void Close() { }
        public override void Open() { }
        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) {
            Assert.Equal(IsolationLevel.Serializable, isolationLevel);
            return new RecordingTransaction(this);
        }
        protected override DbCommand CreateDbCommand() => new RecordingCommand(this);

        private byte[] Version => BitConverter.GetBytes(_version);

        // Dapper uses parameter names without the SQL placeholder prefix in ADO collections.
        private DbDataReader Read(string sql, SqlParameterCollection parameters) {
            if (sql.StartsWith("SELECT source_dataset_name FROM dbo.EncPackage", StringComparison.Ordinal)) {
                Assert.Contains("UPDLOCK, HOLDLOCK", sql);
                var table = new DataTable();
                table.Columns.Add("source_dataset_name", typeof(string));
                if ((Guid)parameters["PackageId"].Value == PackageId)
                    table.Rows.Add(_sourceName);
                return table.CreateDataReader();
            }
            if (sql.Contains("FROM dbo.EncPackageControl WITH (UPDLOCK, HOLDLOCK)", StringComparison.Ordinal)) {
                var table = new DataTable();
                table.Columns.Add("IsPaused", typeof(bool));
                table.Columns.Add("RowVersion", typeof(byte[]));
                if (_hasControl)
                    table.Rows.Add(_paused, Version);
                return table.CreateDataReader();
            }
            if (sql.Contains("FROM dbo.EncPackage p", StringComparison.Ordinal)) {
                var table = new DataTable();
                table.Columns.Add("PackageId", typeof(Guid));
                table.Columns.Add("SourceDatasetName", typeof(string));
                table.Columns.Add("IsPaused", typeof(bool));
                table.Columns.Add("PausedAtUtc", typeof(DateTime));
                table.Columns.Add("UpdatedAtUtc", typeof(DateTime));
                table.Columns.Add("RowVersion", typeof(byte[]));
                if ((Guid)parameters["PackageId"].Value == PackageId)
                    table.Rows.Add(PackageId, _sourceName, _hasControl && _paused,
                        _pausedAt.HasValue ? (object)_pausedAt.Value : DBNull.Value,
                        _updatedAt.HasValue ? (object)_updatedAt.Value : DBNull.Value,
                        _hasControl ? Version : DBNull.Value);
                return table.CreateDataReader();
            }
            throw new NotSupportedException($"Unexpected SQL query: {sql}");
        }

        private int Write(string sql, SqlParameterCollection parameters) {
            if (sql.StartsWith("INSERT INTO dbo.EncPackageControl", StringComparison.Ordinal)) {
                Assert.False(_hasControl);
                _hasControl = true;
                Inserts++;
            }
            else if (sql.StartsWith("UPDATE dbo.EncPackageControl", StringComparison.Ordinal)) {
                Assert.True(_hasControl);
                Assert.True(((byte[])parameters["ExpectedVersion"].Value).SequenceEqual(Version));
                Updates++;
            }
            else
                throw new NotSupportedException($"Unexpected SQL update: {sql}");

            Assert.Equal(_sourceName, parameters["SourceDatasetName"].Value);
            _paused = (bool)parameters["IsPaused"].Value;
            _pausedAt = parameters["PausedAtUtc"].Value as DateTime?;
            _updatedAt = (DateTime)parameters["UpdatedAtUtc"].Value;
            _version++;
            return 1;
        }

        private sealed class RecordingCommand(RecordingConnection connection) : DbCommand
        {
            private readonly SqlCommand _parameterOwner = new();
            [AllowNull]
            public override string CommandText { get; set; } = string.Empty;
            public override int CommandTimeout { get; set; }
            public override CommandType CommandType { get; set; }
            public override bool DesignTimeVisible { get; set; }
            public override UpdateRowSource UpdatedRowSource { get; set; }
            protected override DbConnection? DbConnection { get; set; } = connection;
            protected override DbTransaction? DbTransaction { get; set; }
            protected override DbParameterCollection DbParameterCollection => _parameterOwner.Parameters;
            public override void Cancel() { }
            public override void Prepare() { }
            protected override DbParameter CreateDbParameter() => new SqlParameter();
            private string Capture() {
                var sql = CommandText.Trim();
                connection.Commands.Add(new CapturedCommand(sql, DbTransaction is not null));
                return sql;
            }
            public override int ExecuteNonQuery() => connection.Write(Capture(), _parameterOwner.Parameters);
            public override object ExecuteScalar() => throw new NotSupportedException();
            protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => connection.Read(Capture(), _parameterOwner.Parameters);
            protected override void Dispose(bool disposing) {
                if (disposing) _parameterOwner.Dispose();
                base.Dispose(disposing);
            }
        }

        private sealed class RecordingTransaction(RecordingConnection connection) : DbTransaction
        {
            public override IsolationLevel IsolationLevel => IsolationLevel.Serializable;
            protected override DbConnection DbConnection => connection;
            public override void Commit() => connection.Commits++;
            public override void Rollback() { }
        }
    }
}
