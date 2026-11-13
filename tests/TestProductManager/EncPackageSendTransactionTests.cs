using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.IO.Compression;
using System.Text;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Jobs;

namespace TestProductCatalogueAPI;

/// <summary>Exercises the production Dapper repository's preflight/write ordering and transaction rollback without a database.</summary>
public sealed class EncPackageSendTransactionTests
{
    /// <summary>An invalid second ZIP must fail before either delivery, state or history write.</summary>
    [Fact]
    public async Task BadS57ArchiveLeavesBothCandidatesUnsent() {
        using var database = new RecordingConnection { BadS57Archive = true };
        var repository = new IcEncDeliveryRepository(new Factory(database));
        await Assert.ThrowsAsync<InvalidDataException>(() => repository.ReserveSimulationPackageAsync(database.S101Name, database.PackageId, database.Members, "job-123", DateTime.UtcNow, default));
        Assert.Equal(0, database.WriteAttempts);
        Assert.Empty(database.Deliveries);
        Assert.All(database.States.Values, state => Assert.Equal(ProductState.ReadyForDistribution, state));
        Assert.Equal(0, database.Commits);
        Assert.Equal(1, database.Rollbacks);
    }

    /// <summary>Both candidates commit together; repeating the same job returns its existing pair without another write.</summary>
    [Fact]
    public async Task ValidPairCommitsTogetherAndSameJobReplayDoesNotSendAgain() {
        using var database = new RecordingConnection();
        var repository = new IcEncDeliveryRepository(new Factory(database));
        var pair = await repository.ReserveSimulationPackageAsync(database.S101Name, database.PackageId, database.Members, "job-123", DateTime.UtcNow, default);
        Assert.NotNull(pair);
        Assert.Equal(2, pair.Count);
        Assert.Equal(2, database.Deliveries.Count);
        Assert.All(database.States.Values, state => Assert.Equal(ProductState.InTransit, state));
        Assert.Equal(1, database.Commits);
        Assert.True(database.AllCommandsTransactional);
        var writes = database.WriteAttempts;
        var replay = await repository.ReserveSimulationPackageAsync(database.S101Name, database.PackageId, database.Members, "job-123", DateTime.UtcNow, default);
        Assert.NotNull(replay);
        Assert.Equal(pair.Select(d => d.Id).Order(), replay.Select(d => d.Id).Order());
        Assert.Equal(writes, database.WriteAttempts);
        var resend = await repository.ReserveSimulationPackageAsync(database.S101Name, database.PackageId, database.Members, "another-job", DateTime.UtcNow, default);
        Assert.Null(resend);
        Assert.Equal(writes, database.WriteAttempts);
    }

    /// <summary>An infrastructure failure writing the second member rolls back the first member's tentative delivery/state too.</summary>
    [Fact]
    public async Task SecondMemberWriteFailureRollsBackBothStatesAndDeliveryRecords() {
        using var database = new RecordingConnection { FailSecondDeliveryWrite = true };
        var repository = new IcEncDeliveryRepository(new Factory(database));
        await Assert.ThrowsAsync<IOException>(() => repository.ReserveSimulationPackageAsync(database.S101Name, database.PackageId, database.Members, "job-123", DateTime.UtcNow, default));
        Assert.True(database.WriteAttempts > 1);
        Assert.Empty(database.Deliveries);
        Assert.All(database.States.Values, state => Assert.Equal(ProductState.ReadyForDistribution, state));
        Assert.Equal(0, database.Commits);
        Assert.Equal(1, database.Rollbacks);
    }

    /// <summary>A new job cannot send a Ready sibling while either current member is in transit or errored.</summary>
    [Theory]
    [InlineData(ProductState.InTransit)]
    [InlineData(ProductState.Error)]
    public async Task NonReadySiblingBlocksAllWrites(ProductState blockedState) {
        using var database = new RecordingConnection();
        database.States[ProductSpecification.S57] = blockedState;
        var repository = new IcEncDeliveryRepository(new Factory(database));
        Assert.Null(await repository.ReserveSimulationPackageAsync(database.S101Name, database.PackageId, database.Members, "job-123", DateTime.UtcNow, default));
        Assert.Equal(0, database.WriteAttempts);
        Assert.Empty(database.Deliveries);
        Assert.Equal(ProductState.ReadyForDistribution, database.States[ProductSpecification.S101]);
        Assert.Equal(blockedState, database.States[ProductSpecification.S57]);
    }

    private sealed class Factory(RecordingConnection database) : DbConnectionFactory(new ConfigurationBuilder().Build())
    {
        public override IDbConnection Create() => database;
    }

    private sealed record RecordedDelivery(Guid Id, Guid TrackId, Guid RevisionId, string JobId, ProductSpecification Specification, DateTime ReservedAtUtc);

    /// <summary>ADO double, not a SQL interpreter: it verifies repository orchestration but cannot prove SQL Server lock/index behavior.</summary>
    private sealed class RecordingConnection : DbConnection
    {
        public string S101Name => "101DK0041335E";
        public string S57Name => "DK41335E";
        public Guid PackageId { get; } = Guid.NewGuid();
        public bool BadS57Archive { get; init; }
        public bool FailSecondDeliveryWrite { get; init; }
        public int WriteAttempts { get; private set; }
        public int Commits { get; private set; }
        public int Rollbacks { get; private set; }
        public bool AllCommandsTransactional { get; set; } = true;
        public List<RecordedDelivery> Deliveries { get; } = [];
        public Dictionary<ProductSpecification, ProductState> States { get; } = new() { [ProductSpecification.S101] = ProductState.ReadyForDistribution, [ProductSpecification.S57] = ProductState.ReadyForDistribution };
        private readonly Dictionary<ProductSpecification, Guid> tracks = new() { [ProductSpecification.S101] = Guid.NewGuid(), [ProductSpecification.S57] = Guid.NewGuid() };
        private readonly Dictionary<ProductSpecification, Guid> revisions = new() { [ProductSpecification.S101] = Guid.NewGuid(), [ProductSpecification.S57] = Guid.NewGuid() };
        public EncPackageSendMember[] Members => [new(S101Name, ProductSpecification.S101, 1, 0, revisions[ProductSpecification.S101]), new(S57Name, ProductSpecification.S57, 2, 0, revisions[ProductSpecification.S57])];

        [AllowNull]
        public override string ConnectionString { get; set; } = "";
        public override string Database => "Recording";
        public override string DataSource => "Recording";
        public override string ServerVersion => "1";
        public override ConnectionState State => ConnectionState.Open;
        public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
        public override void Close() { }
        public override void Open() { }
        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) {
            Assert.Equal(IsolationLevel.Serializable, isolationLevel);
            return new Transaction(this);
        }
        protected override DbCommand CreateDbCommand() => new Command(this);

        private string Name(ProductSpecification specification) => specification == ProductSpecification.S101 ? S101Name : S57Name;
        private int Edition(ProductSpecification specification) => specification == ProductSpecification.S101 ? 1 : 2;
        private byte[] Artifact(ProductSpecification specification) {
            var name = specification == ProductSpecification.S57 && BadS57Archive ? "DK30557D" : Name(specification);
            using var stream = new MemoryStream();
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, true)) {
                using var writer = new StreamWriter(zip.CreateEntry((specification == ProductSpecification.S101 ? "S100_ROOT/" : "ENC_ROOT\\") + name + ".000").Open(), new UTF8Encoding(false));
                writer.Write("123456789");
            }
            return stream.ToArray();
        }
        private static DataTable Table(params (string Name, Type Type)[] columns) {
            var table = new DataTable();
            foreach (var column in columns) table.Columns.Add(column.Name, column.Type);
            return table;
        }
        private DbDataReader Read(string sql, SqlParameterCollection parameters) {
            if (sql.Contains("SELECT ep.package_id AS Id", StringComparison.Ordinal)) {
                var table = Table(("Id", typeof(Guid)), ("SourceDatasetName", typeof(string)), ("S57DatasetName", typeof(string)), ("S101Discarded", typeof(bool)), ("S57Discarded", typeof(bool)), ("ErrorMessage", typeof(string)), ("IsPaused", typeof(bool)));
                if ((Guid)parameters["PackageId"].Value == PackageId) table.Rows.Add(PackageId, S101Name, S57Name, false, false, DBNull.Value, false);
                return table.CreateDataReader();
            }
            if (sql.Contains("d.job_id IN", StringComparison.Ordinal)) {
                var table = Table(("Id", typeof(Guid)), ("RevisionId", typeof(Guid)), ("TrackId", typeof(Guid)), ("ReservedAtUtc", typeof(DateTime)), ("Status", typeof(string)), ("Specification", typeof(string)), ("DatasetName", typeof(string)), ("Edition", typeof(int)), ("Update", typeof(int)), ("ExchangeSet", typeof(byte[])));
                var jobIds = parameters.Cast<SqlParameter>().Where(p => p.ParameterName.StartsWith("JobIds", StringComparison.Ordinal)).Select(p => p.Value.ToString()).ToHashSet();
                foreach (var d in Deliveries.Where(d => jobIds.Contains(d.JobId))) table.Rows.Add(d.Id, d.RevisionId, d.TrackId, d.ReservedAtUtc, "Delivered", d.Specification.ToString(), Name(d.Specification), Edition(d.Specification), 0, Artifact(d.Specification));
                return table.CreateDataReader();
            }
            if (sql.Contains("FROM dbo.ProductExportTrack t", StringComparison.Ordinal)) {
                var specification = Enum.Parse<ProductSpecification>((string)parameters["Specification"].Value);
                var table = Table(("Id", typeof(Guid)), ("State", typeof(int)), ("Edition", typeof(int)), ("Update", typeof(int)));
                table.Rows.Add(tracks[specification], (int)States[specification], Edition(specification), 0);
                return table.CreateDataReader();
            }
            if (sql.Contains("FROM dbo.ProductRevision r WITH", StringComparison.Ordinal)) {
                var specification = tracks.Single(p => p.Value == (Guid)parameters["TrackId"].Value).Key;
                var table = Table(("RevisionId", typeof(Guid)), ("Content", typeof(byte[])), ("Edition", typeof(int)), ("Update", typeof(int)));
                table.Rows.Add(revisions[specification], Artifact(specification), Edition(specification), 0);
                return table.CreateDataReader();
            }
            throw new NotSupportedException("Unexpected repository read.");
        }
        private object Scalar(string sql, SqlParameterCollection parameters) {
            if (sql.Contains("h.error_code = @HistoryCode", StringComparison.Ordinal)) return false;
            Assert.Contains("product_revision_id = @RevisionId", sql);
            return Deliveries.Any(d => d.RevisionId == (Guid)parameters["RevisionId"].Value);
        }
        private int Write(string sql, SqlParameterCollection parameters) {
            WriteAttempts++;
            if (sql.StartsWith("INSERT dbo.ProductIcEncDelivery (", StringComparison.Ordinal)) {
                if (FailSecondDeliveryWrite && Deliveries.Count == 1) throw new IOException("Second member write failed.");
                var specification = tracks.Single(p => p.Value == (Guid)parameters["TrackId"].Value).Key;
                Deliveries.Add(new((Guid)parameters["Id"].Value, tracks[specification], (Guid)parameters["RevisionId"].Value, (string)parameters["JobId"].Value, specification, (DateTime)parameters["NowUtc"].Value));
                States[specification] = ProductState.InTransit;
                return 3;
            }
            Assert.StartsWith("INSERT dbo.ProductIcEncDeliveryFile", sql);
            return 1;
        }

        private sealed class Command(RecordingConnection database) : DbCommand
        {
            private readonly SqlCommand parameterOwner = new();
            [AllowNull]
            public override string CommandText { get; set; } = "";
            public override int CommandTimeout { get; set; }
            public override CommandType CommandType { get; set; }
            public override bool DesignTimeVisible { get; set; }
            public override UpdateRowSource UpdatedRowSource { get; set; }
            protected override DbConnection? DbConnection { get; set; } = database;
            protected override DbTransaction? DbTransaction { get; set; }
            protected override DbParameterCollection DbParameterCollection => parameterOwner.Parameters;
            public override void Cancel() { }
            public override void Prepare() { }
            protected override DbParameter CreateDbParameter() => new SqlParameter();
            private string Capture() {
                database.AllCommandsTransactional &= DbTransaction is not null;
                Assert.NotNull(DbTransaction);
                return CommandText.Trim();
            }
            public override int ExecuteNonQuery() => database.Write(Capture(), parameterOwner.Parameters);
            public override object ExecuteScalar() => database.Scalar(Capture(), parameterOwner.Parameters);
            protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => database.Read(Capture(), parameterOwner.Parameters);
            protected override void Dispose(bool disposing) { if (disposing) parameterOwner.Dispose(); base.Dispose(disposing); }
        }
        private sealed class Transaction : DbTransaction
        {
            private readonly RecordingConnection database;
            private readonly Dictionary<ProductSpecification, ProductState> states;
            private readonly RecordedDelivery[] deliveries;
            private bool completed;
            public Transaction(RecordingConnection database) { this.database = database; states = new(database.States); deliveries = database.Deliveries.ToArray(); }
            public override IsolationLevel IsolationLevel => IsolationLevel.Serializable;
            protected override DbConnection DbConnection => database;
            public override void Commit() { completed = true; database.Commits++; }
            public override void Rollback() {
                if (completed) return;
                completed = true;
                foreach (var pair in states) database.States[pair.Key] = pair.Value;
                database.Deliveries.Clear();
                database.Deliveries.AddRange(deliveries);
                database.Rollbacks++;
            }
            protected override void Dispose(bool disposing) { if (disposing && !completed) Rollback(); base.Dispose(disposing); }
        }
    }
}
