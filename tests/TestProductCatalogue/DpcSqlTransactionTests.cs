using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Jobs;
using S100FC.ProductCatalogue;
using System.Data;
using System.Text.RegularExpressions;

namespace TestProductCatalogueAPI;

/// <summary>Opt-in SQL Server tests execute repositories against a fresh database built exclusively from included migrations.</summary>
public sealed class DpcSqlTransactionTests
{
    [DpcSqlFact]
    public async Task AcceptanceFinalizesIndependentVersionsOnlyAfterBothExactDeliveries() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync();
        var first = await db.AcknowledgeAsync(seed, ProductSpecification.S101, IcEncDecision.Accepted);
        Assert.NotNull(first);
        Assert.False(first.ReadyForFinalization);
        Assert.Null(await db.Acknowledgements.GetPublicationAsync(seed.Package.Id, default));
        Assert.Empty(await db.Acknowledgements.GetPendingAsync(default));
        Assert.Null(await db.QueryAsync<int?>("SELECT COL_LENGTH('dbo.ProductExportTrack', 'error_code');"));

        var second = await db.AcknowledgeAsync(seed, ProductSpecification.S57, IcEncDecision.Accepted);
        Assert.True(second!.ReadyForFinalization);
        var publication = await db.Acknowledgements.GetPublicationAsync(seed.Package.Id, default);
        Assert.NotNull(publication);
        Assert.Equal(1, publication.S101Edition);
        Assert.Equal(5, publication.S57Edition);
        await db.Acknowledgements.CompleteAsync(publication, DpcRunFixture.Utc(12), default);
        await db.Acknowledgements.CompleteAsync(publication, DpcRunFixture.Utc(13), default);

        Assert.Null(await db.Packages.GetByIdAsync(seed.Package.Id));
        var s101 = await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101);
        var s57 = await db.Workflows.GetTrackAsync(DpcRunFixture.S57, ProductSpecification.S57);
        Assert.Equal(1, s101!.PublishedEdition);
        Assert.Equal(5, s57!.PublishedEdition);
        Assert.Equal(ProductState.Idle, s101.State);
        Assert.Equal(ProductState.Idle, s57.State);
        Assert.Null(s101.CandidateEdition);
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state = 13;"));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductIcEncDelivery WHERE status = 'Accepted';"));
        Assert.Equal(seed.Package.DetectedAtUtc, (await db.Packages.GetReplayBoundsAsync())[DpcRunFixture.Source]);
    }

    [DpcSqlFact]
    public async Task RejectionOwnsItsDiagnosticInHistoryAndKeepsExactDeliveryEvidence() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync();
        var result = await db.AcknowledgeAsync(seed, ProductSpecification.S101, IcEncDecision.Rejected);
        Assert.NotNull(result);
        Assert.False(result.ReadyForFinalization);
        Assert.Empty(await db.Acknowledgements.GetPendingAsync(default));
        var track = await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101);
        Assert.Equal(ProductState.Rejected, track!.State);
        Assert.Equal("IC_ENC_REJECTED", track.ErrorCode);
        Assert.Equal("fixture rejection", track.ErrorMessage);
        Assert.Equal("Rejected", await db.QueryAsync<string>("SELECT status FROM dbo.ProductIcEncDelivery WHERE delivery_id = @Id", new { Id = seed.S101Delivery }));
        var duplicate = await db.AcknowledgeAsync(seed, ProductSpecification.S101, IcEncDecision.Rejected);
        Assert.True(duplicate!.AlreadyRecorded);
        Assert.Equal(1, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state = 7;"));
    }

    [DpcSqlFact]
    public async Task AcknowledgementFailureRollsBackDeliveryTrackAndHistoryTogether() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync();
        await db.ExecuteAsync("""
            CREATE TRIGGER dbo.FailDpcAcknowledgement ON dbo.ProductStateHistory AFTER INSERT AS
            IF EXISTS (SELECT 1 FROM inserted WHERE state = 7)
                THROW 51200, 'Injected acknowledgement history failure', 1;
            """);
        await Assert.ThrowsAsync<SqlException>(() => db.AcknowledgeAsync(seed, ProductSpecification.S101, IcEncDecision.Rejected));
        Assert.Equal(ProductState.InTransit, (await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101))!.State);
        Assert.Equal("Delivered", await db.QueryAsync<string>("SELECT status FROM dbo.ProductIcEncDelivery WHERE delivery_id = @Id", new { Id = seed.S101Delivery }));
        Assert.Equal(0, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state = 7;"));
    }

    [DpcSqlFact]
    public async Task S128SuccessThenSqlFailureRetainsAcceptedStateAndRetriesIdempotently() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync();
        await db.AcknowledgeAsync(seed, ProductSpecification.S101, IcEncDecision.Accepted);
        await db.AcknowledgeAsync(seed, ProductSpecification.S57, IcEncDecision.Accepted);
        await db.ExecuteAsync("""
            CREATE TRIGGER dbo.FailDpcFinalization ON dbo.EncPackage AFTER DELETE AS
                THROW 51201, 'Injected finalization failure after both track updates', 1;
            """);
        var terminalHistoryBefore = await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state IN (13, 1);");
        var f = await DpcRunFixture.CreateAsync();
        var service = new EncPackageFinalizationService(db.Acknowledgements, f.Manager, f.Locks, f.Clock,
            NullLogger<EncPackageFinalizationService>.Instance);

        await Assert.ThrowsAsync<SqlException>(() => service.FinalizeAsync(seed.Package.Id, default));

        Assert.Equal(1, f.PublicationCalls);
        Assert.Single(f.PublishedPackageIds);
        Assert.NotNull(await db.Packages.GetByIdAsync(seed.Package.Id));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductExportTrack WHERE state = 12 AND candidate_edition IS NOT NULL;"));
        Assert.Equal(terminalHistoryBefore, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state IN (13, 1);"));
        Assert.Empty(await db.Packages.GetReplayBoundsAsync());
        await db.ExecuteAsync("DROP TRIGGER dbo.FailDpcFinalization;");
        await service.FinalizePendingAsync(default);
        Assert.Equal(2, f.PublicationCalls);
        Assert.Single(f.PublishedPackageIds);
        Assert.Null(await db.Packages.GetByIdAsync(seed.Package.Id));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state = 13;"));
    }

    [DpcSqlFact]
    public async Task CompleteCoordinatorRunFinalizesBothAcceptedDeliveriesAndRetiresItsEmptyReplayInSql() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync();
        await db.AcknowledgeAsync(seed, ProductSpecification.S101, IcEncDecision.Accepted);
        await db.AcknowledgeAsync(seed, ProductSpecification.S57, IcEncDecision.Accepted);
        await db.Workflows.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), DpcRunFixture.Utc(12));
        var f = await DpcRunFixture.CreateAsync();
        f.Clock.Now = DpcRunFixture.Utc(14);
        var finalization = new EncPackageFinalizationService(db.Acknowledgements, f.Manager, f.Locks, f.Clock,
            NullLogger<EncPackageFinalizationService>.Instance);
        var exports = DpcProxy<ProductCatalogueAPI.Services.Operations.IExportOperationService>.Create((method, _) =>
            throw new InvalidOperationException("An empty finalization replay must not export or discard: " + method.Name));
        var detector = new EncPackageDetectionService(db.Workflows, db.Workflows, db.Packages, f.Manager, exports,
            f.Locks, f.Clock, NullLogger<EncPackageDetectionService>.Instance, new ConfigurationBuilder().Build(), finalization);

        await detector.RunAsync(default);

        Assert.Equal(1, f.PublicationCalls);
        Assert.Null(await db.Packages.GetByIdAsync(seed.Package.Id));
        Assert.Empty(await db.Packages.GetReplayBoundsAsync());
        Assert.Equal(DpcRunFixture.Utc(14), await db.Workflows.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob)));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductIcEncDelivery WHERE status = 'Accepted';"));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductExportTrack WHERE state = 1 AND candidate_edition IS NULL;"));
    }

    [DpcSqlFact]
    public async Task ReplayRetirementAndSnapshotCreationCannotConsumeAConcurrentlyQueuedOlderBound() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        await db.Packages.MarkReplayAsync(DpcRunFixture.Source, DpcRunFixture.Utc(10));
        await db.Packages.MarkReplayAsync(DpcRunFixture.Source, DpcRunFixture.Utc(8));
        await db.Packages.RetireReplayAsync(DpcRunFixture.Source, DpcRunFixture.Utc(10));
        Assert.Equal(DpcRunFixture.Utc(8), (await db.Packages.GetReplayBoundsAsync())[DpcRunFixture.Source]);
        var laterSnapshot = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = DpcRunFixture.Source,
            S57DatasetName = DpcRunFixture.S57, ScanFromUtc = DpcRunFixture.Utc(10), DetectedAtUtc = DpcRunFixture.Utc(12), DatasetYaml = "fixture", SummaryYaml = "fixture" };
        Assert.True(await db.Packages.TryCreateAsync(laterSnapshot));
        Assert.Equal(DpcRunFixture.Utc(8), (await db.Packages.GetReplayBoundsAsync())[DpcRunFixture.Source]);
        await db.Packages.RetireReplayAsync(DpcRunFixture.Source, DpcRunFixture.Utc(8));
        Assert.Empty(await db.Packages.GetReplayBoundsAsync());
    }

    [DpcSqlTheory]
    [InlineData("Sending", ProductState.ReadyForDistribution, false)]
    [InlineData("Delivered", ProductState.Error, false)]
    [InlineData("Uncertain", ProductState.Error, false)]
    [InlineData("Accepted", ProductState.ReadyForDistribution, false)]
    [InlineData("Rejected", ProductState.Error, false)]
    [InlineData("Rejected", ProductState.Rejected, true)]
    [InlineData("NotDelivered", ProductState.ReadyForDistribution, true)]
    public async Task PairedRefreshChecksBothMembersAndExactOutcomeBeforeAnyMutation(string status, ProductState state, bool allowed) {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        await db.InsertDeliveryAsync(seed.S57Track, seed.S57Revision, status);
        await db.Workflows.SetStateAsync(seed.S57Track, state, "fixture", DpcRunFixture.Utc(11));
        await db.Packages.MarkReplayAsync(DpcRunFixture.Source, seed.Package.ScanFromUtc);
        var historyCount = await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory;");
        Assert.Equal(allowed, await db.Packages.CanRefreshAsync(seed.Package.Id));

        var result = await db.Packages.TryDiscardForRefreshAsync(seed.Package.Id, DpcRunFixture.Utc(12));

        Assert.Equal(allowed ? EncPackageDiscardStatus.Discarded : EncPackageDiscardStatus.Conflict, result.Status);
        Assert.Equal(1, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductIcEncDelivery;"));
        var s101 = await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101);
        var s57 = await db.Workflows.GetTrackAsync(DpcRunFixture.S57, ProductSpecification.S57);
        Assert.Equal(allowed, s101!.CandidateEdition is null);
        Assert.Equal(allowed, s57!.CandidateEdition is null);
        if (!allowed) {
            Assert.Equal(historyCount, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory;"));
            Assert.NotNull(await db.Packages.GetByIdAsync(seed.Package.Id));
        }
        else {
            Assert.Null(await db.Packages.GetByIdAsync(seed.Package.Id));
            Assert.Equal(seed.Package.ScanFromUtc, (await db.Packages.GetReplayBoundsAsync())[DpcRunFixture.Source]);
        }
    }

    [DpcSqlTheory]
    [InlineData("NotDelivered", ProductState.ReadyForDistribution, true)]
    [InlineData("Rejected", ProductState.Rejected, true)]
    [InlineData("Rejected", ProductState.ReadyForDistribution, false)]
    [InlineData("Sending", ProductState.Error, false)]
    [InlineData("Delivered", ProductState.Error, false)]
    [InlineData("Uncertain", ProductState.Error, false)]
    [InlineData("Accepted", ProductState.Error, false)]
    public async Task IndividualDiscardUsesTheSameExactDeliveryEligibility(string status, ProductState state, bool allowed) {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, status);
        await db.Workflows.SetStateAsync(seed.S101Track, state, "fixture", DpcRunFixture.Utc(11));
        if (allowed) await db.Workflows.DiscardCandidateAsync(seed.S101Track, "fixture", DpcRunFixture.Utc(12));
        else await Assert.ThrowsAsync<InvalidOperationException>(() => db.Workflows.DiscardCandidateAsync(seed.S101Track, "fixture", DpcRunFixture.Utc(12)));
        Assert.Equal(allowed, (await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101))!.CandidateEdition is null);
        Assert.Equal(status, await db.QueryAsync<string>("SELECT status FROM dbo.ProductIcEncDelivery;"));
    }

    [DpcSqlTheory]
    [InlineData(ProductState.Frozen, false)]
    [InlineData(ProductState.Exporting, false)]
    [InlineData(ProductState.Validating, false)]
    [InlineData(ProductState.InTransit, false)]
    [InlineData(ProductState.AcceptedForDistribution, false)]
    [InlineData(ProductState.ReadyForDistribution, true)]
    public async Task IneligibleSecondMemberCannotDiscardItsReadyCounterpart(ProductState state, bool freeze) {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        await db.Workflows.SetStateAsync(seed.S57Track, state, "fixture", DpcRunFixture.Utc(11));
        if (freeze) await db.Workflows.SetManualFreezeAsync(seed.S57Track, "fixture", DpcRunFixture.Utc(11));
        var result = await db.Packages.TryDiscardForRefreshAsync(seed.Package.Id, DpcRunFixture.Utc(12));
        Assert.Equal(EncPackageDiscardStatus.Conflict, result.Status);
        Assert.NotNull((await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101))!.CandidateEdition);
        Assert.Equal(0, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state = 14;"));
    }

    [DpcSqlFact]
    public async Task EarlierAcceptedDeliveryWithSameVersionDoesNotBlockTheLatestUnsentRevision() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        var oldRevision = await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition, 1, 0,
            "old yaml", "old summary", "fixture", DpcRunFixture.Utc(7)));
        await db.InsertDeliveryAsync(seed.S101Track, oldRevision, "Accepted");
        var result = await db.Packages.TryDiscardForRefreshAsync(seed.Package.Id, DpcRunFixture.Utc(12));
        Assert.Equal(EncPackageDiscardStatus.Discarded, result.Status);
        Assert.Equal("Accepted", await db.QueryAsync<string>("SELECT status FROM dbo.ProductIcEncDelivery;"));
        Assert.Equal(3, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductRevision;"));
    }

    [DpcSqlFact]
    public async Task RejectedDeliveryEvidenceDoesNotStrandAnInterruptedReplacementAtTheSameVersion() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "Rejected");
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.Rejected, "fixture", DpcRunFixture.Utc(11));
        Assert.Equal(EncPackageDiscardStatus.Discarded, (await db.Packages.TryDiscardForRefreshAsync(seed.Package.Id, DpcRunFixture.Utc(12))).Status);
        var replacement = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = DpcRunFixture.Source,
            S57DatasetName = DpcRunFixture.S57, ScanFromUtc = seed.Package.ScanFromUtc, DetectedAtUtc = DpcRunFixture.Utc(12), DatasetYaml = "replacement yaml", SummaryYaml = "replacement summary" };
        Assert.True(await db.Packages.TryCreateAsync(replacement));
        await db.Workflows.BeginExportAsync(seed.S101Track, 1, 0, "fixture", DpcRunFixture.Utc(12));
        await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition, 1, 0,
            replacement.DatasetYaml, replacement.SummaryYaml, "fixture", DpcRunFixture.Utc(12)));
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.Validating, "fixture", DpcRunFixture.Utc(12));
        Assert.True(await db.Workflows.TryFailInterruptedPackageExportAsync(replacement.Id, seed.S101Track,
            DpcRunFixture.Source, ProductSpecification.S101, ProductState.Validating, DpcRunFixture.Utc(12), 1, 0, DpcRunFixture.Utc(14)));
        Assert.Equal(ProductState.Error, (await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101))!.State);
        Assert.Equal("Rejected", await db.QueryAsync<string>("SELECT status FROM dbo.ProductIcEncDelivery;"));
        Assert.NotNull(await db.Packages.GetByIdAsync(replacement.Id));
    }

    [DpcSqlFact]
    public async Task ANewerUnacceptedRevisionCannotBeFinalizedUsingOlderAcceptanceWithTheSameVersion() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync();
        await db.AcknowledgeAsync(seed, ProductSpecification.S101, IcEncDecision.Accepted);
        await db.AcknowledgeAsync(seed, ProductSpecification.S57, IcEncDecision.Accepted);
        var publication = (await db.Acknowledgements.GetPublicationAsync(seed.Package.Id, default))!;
        await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition, 1, 0,
            "newer yaml", "newer summary", "fixture", DpcRunFixture.Utc(11)));
        Assert.Null(await db.Acknowledgements.GetPublicationAsync(seed.Package.Id, default));
        Assert.Empty(await db.Acknowledgements.GetPendingAsync(default));
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.Acknowledgements.CompleteAsync(publication, DpcRunFixture.Utc(12), default));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductExportTrack WHERE state = 12;"));
        Assert.NotNull(await db.Packages.GetByIdAsync(seed.Package.Id));
    }

    [DpcSqlFact]
    public async Task FailureAfterFirstMemberMutationRollsBackTheWholeDiscardAndItsReplay() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        await db.ExecuteAsync("""
            CREATE TRIGGER dbo.FailDpcDiscard ON dbo.ProductExportTrack AFTER UPDATE AS
            IF EXISTS (SELECT 1 FROM inserted WHERE product_specification = 'S57' AND candidate_edition IS NULL)
                THROW 51202, 'Injected second member discard failure', 1;
            """);
        await Assert.ThrowsAsync<SqlException>(() => db.Packages.TryDiscardForRefreshAsync(seed.Package.Id, DpcRunFixture.Utc(12)));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductExportTrack WHERE candidate_edition IS NOT NULL;"));
        Assert.Equal(0, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE state = 14;"));
        Assert.NotNull(await db.Packages.GetByIdAsync(seed.Package.Id));
        Assert.Empty(await db.Packages.GetReplayBoundsAsync());
    }
}

/// <summary>Skips SQL tests unless an operator explicitly supplies a disposable-test server connection.</summary>
public sealed class DpcSqlFactAttribute : FactAttribute
{
    public DpcSqlFactAttribute() { if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(DpcSqlDatabase.ConnectionVariable))) Skip = DpcSqlDatabase.SkipReason; }
}

/// <summary>Uses the same explicit SQL opt-in for each transactional outcome case.</summary>
public sealed class DpcSqlTheoryAttribute : TheoryAttribute
{
    public DpcSqlTheoryAttribute() { if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(DpcSqlDatabase.ConnectionVariable))) Skip = DpcSqlDatabase.SkipReason; }
}

/// <summary>Creates and drops only its own unique database; never migrates or clears the supplied connection's database.</summary>
internal sealed class DpcSqlDatabase : IAsyncDisposable
{
    internal const string ConnectionVariable = "PRODUCTCATALOGUE_DPC_SQL_TEST_CONNECTION";
    internal const string SkipReason = "Set PRODUCTCATALOGUE_DPC_SQL_TEST_CONNECTION to an authorized test SQL Server (Initial Catalog=master); tests create and drop a unique database.";
    private readonly string _master;
    private readonly string _databaseName = "ProductCatalogue_DpcTests_" + Guid.NewGuid().ToString("N");
    private readonly string _connection;
    internal readonly ProductRepository Workflows;
    internal readonly EncPackageRepository Packages;
    internal readonly EncPackageAcknowledgementRepository Acknowledgements;
    private readonly IcEncDeliveryRepository _deliveries;
    private DpcSqlDatabase(string master) {
        var builder = new SqlConnectionStringBuilder(master);
        if (!string.Equals(builder.InitialCatalog, "master", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("DPC SQL tests require an explicitly authorized test server connection with Initial Catalog=master.");
        builder.ApplicationName = "ProductCatalogue DPC isolated regression tests";
        _master = builder.ConnectionString;
        builder.InitialCatalog = _databaseName;
        _connection = builder.ConnectionString;
        var factory = new Factory(_connection);
        Workflows = new(factory);
        Packages = new(factory);
        Acknowledgements = new(factory);
        _deliveries = new(factory);
    }
    internal static async Task<DpcSqlDatabase> CreateAsync() {
        var db = new DpcSqlDatabase(Environment.GetEnvironmentVariable(ConnectionVariable)!);
        using (var connection = new SqlConnection(db._master))
            await connection.ExecuteAsync($"CREATE DATABASE [{db._databaseName}];");
        try {
            var directory = Path.Combine(AppContext.BaseDirectory, "DpcMigrations");
            var files = Directory.GetFiles(directory, "*.sql").OrderBy(Path.GetFileName, StringComparer.Ordinal).ToArray();
            Assert.Contains(files, path => Path.GetFileName(path) == "001_ReplaceJobTableWithProductWorkflow.sql");
            Assert.Contains(files, path => Path.GetFileName(path) == "007_AddIcEncAcknowledgements.sql");
            foreach (var file in files) {
                var sql = await File.ReadAllTextAsync(file);
                foreach (var batch in Regex.Split(sql, @"^\s*GO\s*(?:--[^\r\n]*)?$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
                    if (!string.IsNullOrWhiteSpace(batch)) await db.ExecuteAsync(batch);
            }
            return db;
        }
        catch { await db.DisposeAsync(); throw; }
    }
    internal Task ExecuteAsync(string sql, object? parameters = null) => ExecuteCoreAsync(sql, parameters);
    private async Task ExecuteCoreAsync(string sql, object? parameters) { using var connection = new SqlConnection(_connection); await connection.ExecuteAsync(sql, parameters); }
    internal async Task<T> QueryAsync<T>(string sql, object? parameters = null) { using var connection = new SqlConnection(_connection); return await connection.QuerySingleAsync<T>(sql, parameters); }
    internal async Task<Guid> InsertDeliveryAsync(Guid track, Guid revision, string status) {
        var id = Guid.NewGuid();
        await ExecuteAsync("""
            INSERT dbo.ProductIcEncDelivery(delivery_id, product_export_track_id, product_revision_id, job_id, status, reserved_at_utc)
            VALUES(@Id, @Track, @Revision, 'fixture', @Status, @Now);
            """, new { Id = id, Track = track, Revision = revision, Status = status, Now = DpcRunFixture.Utc(10) });
        return id;
    }
    internal async Task<Seed> SeedAsync(bool deliver = true) {
        var package = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = DpcRunFixture.Source,
            S57DatasetName = DpcRunFixture.S57, ScanFromUtc = DpcRunFixture.Utc(8), DetectedAtUtc = DpcRunFixture.Utc(10), DatasetYaml = "CellName: 101DK001.000", SummaryYaml = "fixture summary" };
        Assert.True(await Packages.TryCreateAsync(package));
        var s101 = await CandidateAsync(DpcRunFixture.Source, ProductSpecification.S101, 0);
        var s57 = await CandidateAsync(DpcRunFixture.S57, ProductSpecification.S57, 4);
        Guid? delivery101 = null, delivery57 = null;
        if (deliver) {
            delivery101 = (await _deliveries.ReserveAsync(DpcRunFixture.Source, ProductSpecification.S101, 1, 0, "fixture101", DpcRunFixture.Utc(10), default))!.Id;
            delivery57 = (await _deliveries.ReserveAsync(DpcRunFixture.S57, ProductSpecification.S57, 5, 0, "fixture57", DpcRunFixture.Utc(10), default))!.Id;
            await _deliveries.MarkDeliveredAsync(delivery101.Value, DpcRunFixture.Utc(10), default);
            await _deliveries.MarkDeliveredAsync(delivery57.Value, DpcRunFixture.Utc(10), default);
        }
        return new(package, s101.Track, s57.Track, s101.Revision, s57.Revision, delivery101, delivery57);
    }
    private async Task<(Guid Track, Guid Revision)> CandidateAsync(string name, ProductSpecification spec, int publishedEdition) {
        var track = await Workflows.GetOrCreateTrackAsync(name, spec, ExportEngineKind.IsoIec8211, publishedEdition, 0);
        // GetOrCreateTrackAsync records its initial Idle history with the system clock.
        // Normalize that fixture-only row before adding deterministic workflow events.
        await ExecuteAsync("UPDATE dbo.ProductStateHistory SET occurred_at_utc = @At WHERE product_export_track_id = @TrackId AND state = 1;",
            new { At = DpcRunFixture.Utc(7), TrackId = track.Id });
        await Workflows.BeginExportAsync(track.Id, publishedEdition + 1, 0, "fixture", DpcRunFixture.Utc(10));
        var revision = await Workflows.AddRevisionAsync(new(track.Id, ExportRevisionType.NewEdition, publishedEdition + 1, 0, "CellName: 101DK001.000", "fixture summary", "fixture", DpcRunFixture.Utc(10)));
        foreach (var kind in new[] { ProductArtifactKind.ExchangeSet, ProductArtifactKind.CompilerIndex, ProductArtifactKind.CatalogueSignature, ProductArtifactKind.ValidationDiagnostic })
            await Workflows.AddArtifactAsync(new(track.Id, revision, kind, "fixture.bin", "application/octet-stream", "fixture"u8.ToArray(), DpcRunFixture.Utc(10)));
        await Workflows.SetStateAsync(track.Id, ProductState.ReadyForDistribution, "fixture", DpcRunFixture.Utc(10));
        return (track.Id, revision);
    }
    internal Task<IcEncAcknowledgementResult?> AcknowledgeAsync(Seed seed, ProductSpecification spec, IcEncDecision decision) => Acknowledgements.RecordAsync(
        new(spec == ProductSpecification.S101 ? DpcRunFixture.Source : DpcRunFixture.S57, spec, spec == ProductSpecification.S101 ? 1 : 5, 0, decision,
            "fixture notice", IcEncAcknowledgementSource.Manual, Reason: decision == IcEncDecision.Rejected ? "fixture rejection" : null,
            DeliveryId: spec == ProductSpecification.S101 ? seed.S101Delivery : seed.S57Delivery), DpcRunFixture.Utc(11), default);
    internal sealed record Seed(EncPackage Package, Guid S101Track, Guid S57Track, Guid S101Revision, Guid S57Revision, Guid? S101Delivery, Guid? S57Delivery);
    private sealed class Factory(string connection) : DbConnectionFactory(new ConfigurationBuilder().Build()) { public override IDbConnection Create() => new SqlConnection(connection); }
    public async ValueTask DisposeAsync() {
        // The generated identifier contains only a fixed prefix and a GUID; caller input cannot enter DDL identifiers.
        using var connection = new SqlConnection(_master);
        await connection.ExecuteAsync($"IF DB_ID('{_databaseName}') IS NOT NULL BEGIN ALTER DATABASE [{_databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_databaseName}]; END;");
    }
}
