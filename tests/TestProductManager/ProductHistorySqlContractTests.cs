using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;

namespace TestProductCatalogueAPI;

public class ProductHistorySqlContractTests
{
    [Fact]
    public async Task SqlHistoryUsesCanonicalExactEqualityAndFinalizedPredicateWhileReadingUnknownStrings()
    {
        using var connection = new RecordingConnection();
        connection.QueryResults.Columns.Add("Id", typeof(Guid));
        connection.QueryResults.Columns.Add("OperationId", typeof(Guid));
        connection.QueryResults.Columns.Add("DatasetName", typeof(string));
        connection.QueryResults.Columns.Add("EventType", typeof(string));
        connection.QueryResults.Columns.Add("Outcome", typeof(string));
        connection.QueryResults.Columns.Add("FinalizedAtUtc", typeof(DateTime));
        connection.QueryResults.Rows.Add(Guid.NewGuid(), Guid.NewGuid(), "101DK001", "FutureProducerType", "FutureOutcome", DateTime.UtcNow);
        var repository = new ProductHistoryEventRepository(new RecordingFactory(connection));
        var service = new ProductCatalogueAPI.Services.History.ProductHistoryEventService(repository, TimeProvider.System);

        var result = Assert.Single(await service.GetFinalizedByDatasetNameAsync("  101dk001 "));

        Assert.Equal("FutureProducerType", result.EventType);
        Assert.Equal("FutureOutcome", result.Outcome);
        var query = Assert.Single(connection.Commands);
        Assert.Equal("101DK001", query.Parameters["DatasetName"]);
        Assert.Contains("DatasetName = @DatasetName", query.Sql);
        Assert.Contains("CONVERT(varbinary(512), DatasetName) = CONVERT(varbinary(512), @DatasetName)", query.Sql);
        Assert.Contains("FinalizedAtUtc IS NOT NULL", query.Sql);
    }

    [Fact]
    public async Task SqlFinalizationCannotOverwriteATerminalRow()
    {
        using var connection = new RecordingConnection();
        var repository = new ProductHistoryEventRepository(new RecordingFactory(connection));

        await repository.TryFinalizeAsync(new ProductHistoryEventRecord { Id = Guid.NewGuid(), OperationId = Guid.NewGuid() });

        Assert.Contains("Id = @Id AND OperationId = @OperationId AND FinalizedAtUtc IS NULL", Assert.Single(connection.Commands).Sql);
    }

    private sealed class RecordingFactory(RecordingConnection connection) : DbConnectionFactory(new ConfigurationBuilder().Build())
    {
        public override IDbConnection Create() => connection;
    }

    private sealed record CapturedCommand(string Sql, Dictionary<string, object?> Parameters, bool HasTransaction);

    private sealed class RecordingConnection : DbConnection
    {
        internal List<CapturedCommand> Commands { get; } = [];
        internal DataTable QueryResults { get; } = new();
        [AllowNull]
        public override string ConnectionString { get; set; } = string.Empty;
        public override string Database => "Recording";
        public override string DataSource => "Recording";
        public override string ServerVersion => "1";
        public override ConnectionState State => ConnectionState.Open;
        public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
        public override void Close() { }
        public override void Open() { }
        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) => new RecordingTransaction(this);
        protected override DbCommand CreateDbCommand() => new RecordingCommand(this);
    }

    private sealed class RecordingTransaction(RecordingConnection connection) : DbTransaction
    {
        public override IsolationLevel IsolationLevel => IsolationLevel.ReadCommitted;
        protected override DbConnection DbConnection => connection;
        public override void Commit() { }
        public override void Rollback() { }
    }

    private sealed class RecordingCommand(RecordingConnection connection) : DbCommand
    {
        private readonly SqlCommand parameterOwner = new();
        [AllowNull]
        public override string CommandText { get; set; } = string.Empty;
        public override int CommandTimeout { get; set; }
        public override CommandType CommandType { get; set; }
        public override bool DesignTimeVisible { get; set; }
        public override UpdateRowSource UpdatedRowSource { get; set; }
        protected override DbConnection? DbConnection { get; set; } = connection;
        protected override DbTransaction? DbTransaction { get; set; }
        protected override DbParameterCollection DbParameterCollection => parameterOwner.Parameters;
        public override void Cancel() { }
        public override void Prepare() { }
        protected override DbParameter CreateDbParameter() => new SqlParameter();
        private void Capture() => connection.Commands.Add(new(CommandText,
            DbParameterCollection.Cast<DbParameter>().ToDictionary(p => p.ParameterName.TrimStart('@'), p => p.Value),
            DbTransaction != null));
        public override int ExecuteNonQuery() { Capture(); return 1; }
        public override object ExecuteScalar() => throw new NotSupportedException();
        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
        {
            Capture();
            return connection.QueryResults.CreateDataReader();
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) parameterOwner.Dispose();
            base.Dispose(disposing);
        }
    }
}
