using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.History;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogueAPI;

public sealed class ProductHistoryRecoveryTests
{
    [Fact]
    public async Task SuccessfulExportHasOneEventWithExactCompletionAndSeparateIdentities() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.ExecuteAsync();
        var row = Assert.Single(fixture.Store.Rows);
        Assert.Equal(ProductHistoryEventContract.Succeeded, row.Outcome);
        Assert.Equal(fixture.StateId, row.StateRecordId);
        Assert.Equal(fixture.Request.OperationId, row.OperationId);
        Assert.NotEqual(row.Id, row.OperationId);
        Assert.Equal("job-42", row.JobId);
        Assert.Equal("correlation-42", row.CorrelationId);
        Assert.Contains("\"ResultEdition\":\"5\"", row.OperationMetadataJson);
        Assert.Equal(1, fixture.BusinessCalls);
    }

    [Fact]
    public async Task LockRejectionRecordsFailureOnlyForAFreshOperation() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.Producer.RecordNotStartedAsync(fixture.Request, fixture.Context);
        Assert.Equal(ProductHistoryEventContract.Failed, Assert.Single(fixture.Store.Rows).Outcome);
        Assert.Null(fixture.Store.Rows[0].ExecutionStartedAtUtc);
        Assert.Equal(0, fixture.BusinessCalls);
        await fixture.Producer.RecordNotStartedAsync(fixture.Request, fixture.Context);
        Assert.Equal(1, fixture.Store.FinalizationCount);

        var active = new HistoryRecoveryFixture();
        await active.SeedPendingAsync(true);
        await active.Producer.RecordNotStartedAsync(active.Request, active.Context);
        Assert.Null(active.Store.Rows[0].FinalizedAtUtc);
        Assert.Null(active.Context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal));
    }

    [Fact]
    public async Task PendingInsertFailurePreventsBusinessExecution() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailInsert = true;
        var exception = await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.Equal(ExportJobContract.HistoryUnavailableCode, exception.Code);
        Assert.Equal(0, fixture.BusinessCalls);
        Assert.Null(fixture.Context.GetJobParameter<bool?>(ExportJobParameterNames.ExecutionStarted));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CheckpointFailureNeverExecutesOrReplays(bool failGuardWrite) {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailCheckpoint = !failGuardWrite;
        fixture.Context.FailParameter = failGuardWrite ? ExportJobParameterNames.ExecutionStarted : null;
        var exception = await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.Equal(ExportJobContract.HistoryUnavailableCode, exception.Code);
        Assert.Equal(0, fixture.BusinessCalls);
        fixture.Store.FailCheckpoint = false;
        fixture.Context.FailParameter = null;
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.Equal(0, fixture.BusinessCalls);
        Assert.Equal(ProductHistoryEventContract.RequiresManualReview, Assert.Single(fixture.Store.Rows).Outcome);
    }

    [Fact]
    public async Task CheckpointAndFinalizationFailureStillCannotReplayAfterRestart() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailCheckpoint = true;
        fixture.Store.FailFinalize = true;
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.True(fixture.Context.GetJobParameter<bool?>(ExportJobParameterNames.ExecutionStarted));
        fixture.Store.FailCheckpoint = false;
        fixture.Store.FailFinalize = false;
        fixture.Restart();
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.Equal(0, fixture.BusinessCalls);
    }

    [Fact]
    public async Task GuardWriteAndAuditFailureLeavePendingButNeverReplay() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Context.FailParameter = ExportJobParameterNames.ExecutionStarted;
        fixture.Store.FailFinalize = true;
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        fixture.Context.FailParameter = null;
        fixture.Store.FailFinalize = false;
        fixture.Restart();
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.Equal(0, fixture.BusinessCalls);
    }

    [Fact]
    public async Task PreconditionRejectionAndUncertainExecutionHaveDifferentOutcomes() {
        var rejected = new HistoryRecoveryFixture();
        await Assert.ThrowsAsync<ExportOperationJobException>(() => rejected.Producer.ExecuteAsync(
            rejected.Request, rejected.Context, _ => throw new ExportOperationJobException("PRODUCT_VERSION_CHANGED", "Safe rejection.")));
        Assert.Equal(ProductHistoryEventContract.Failed, Assert.Single(rejected.Store.Rows).Outcome);
        Assert.Null(rejected.Store.Rows[0].ExecutionStartedAtUtc);

        var uncertain = new HistoryRecoveryFixture();
        await Assert.ThrowsAsync<IOException>(() => uncertain.Producer.ExecuteAsync(
            uncertain.Request, uncertain.Context, async start => { await start(); throw new IOException("password=secret; internal/path"); }));
        var row = Assert.Single(uncertain.Store.Rows);
        Assert.Equal(ProductHistoryEventContract.RequiresManualReview, row.Outcome);
        Assert.DoesNotContain("secret", row.SafeMessage);
        Assert.Null(row.StateRecordId);
    }

    [Fact]
    public async Task ConfirmedServicePreconditionRejectionAfterCheckpointIsFailed() {
        var fixture = new HistoryRecoveryFixture();
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.Producer.ExecuteAsync(
            fixture.Request, fixture.Context, async start => {
                await start();
                throw new ExportOperationJobException(ExportJobContract.ProductOperationRejectedCode, "Safe rejection.") { IsPreExecutionRejection = true };
            }));
        Assert.Equal(ProductHistoryEventContract.Failed, Assert.Single(fixture.Store.Rows).Outcome);
    }

    [Fact]
    public async Task RejectionCodeAloneDoesNotProveFailureBeforeMutation() {
        var fixture = new HistoryRecoveryFixture();
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.Producer.ExecuteAsync(
            fixture.Request, fixture.Context, async start => {
                await start();
                throw new ExportOperationJobException(ExportJobContract.ProductOperationRejectedCode, "Safe rejection.");
            }));
        Assert.Equal(ProductHistoryEventContract.RequiresManualReview, fixture.Store.Rows[0].Outcome);
    }

    [Fact]
    public async Task AuditFinalizationFailureDoesNotFailExportAndReconcilesFromReceipt() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailFinalize = true;
        await fixture.ExecuteAsync();
        Assert.Null(Assert.Single(fixture.Store.Rows).FinalizedAtUtc);
        var terminal = fixture.Context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal);
        Assert.NotNull(terminal);
        Assert.Equal(fixture.StateId, terminal.StateRecordId);
        Assert.Equal(ExportOperationContract.ExportCompletedCode, fixture.Context.GetJobParameter<string>(ExportJobParameterNames.ResultCode));
        fixture.Store.FailFinalize = false;
        fixture.Jobs.State = fixture.Snapshot("Succeeded");
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        Assert.Equal(1, fixture.Store.FinalizationCount);
        Assert.Equal(ProductHistoryEventContract.Succeeded, fixture.Store.Rows[0].Outcome);
        Assert.Equal(1, fixture.BusinessCalls);
    }

    [Fact]
    public async Task TerminalMetadataWriteFailureCannotTurnBusinessSuccessIntoJobFailure() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Context.FailParameter = ExportJobParameterNames.HistoryTerminal;
        await fixture.ExecuteAsync();
        Assert.Equal(1, fixture.BusinessCalls);
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        fixture.Context.FailParameter = null;
        fixture.Jobs.State = fixture.Snapshot("Succeeded");
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        Assert.Equal(ProductHistoryEventContract.RequiresManualReview, fixture.Store.Rows[0].Outcome);
    }

    [Fact]
    public async Task StateReadOutageAfterBusinessSuccessRetainsDurableReceiptForRecovery() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailStateRead = true;
        await fixture.ExecuteAsync();
        Assert.NotNull(fixture.Context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal));
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        fixture.Store.FailStateRead = false;
        fixture.Jobs.State = fixture.Snapshot("Succeeded");
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        Assert.Equal(ProductHistoryEventContract.Succeeded, fixture.Store.Rows[0].Outcome);
    }

    [Fact]
    public async Task RestartAndRepeatedRequeueNeverRepeatBusinessExecution() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailFinalize = true;
        await fixture.ExecuteAsync();
        fixture.Store.FailFinalize = false;
        fixture.Restart();
        await fixture.ExecuteAsync();
        await fixture.ExecuteAsync();
        Assert.Equal(1, fixture.BusinessCalls);
        Assert.Single(fixture.Store.Rows);
        Assert.Equal(1, fixture.Store.FinalizationCount);
    }

    [Fact]
    public async Task RequeueDuringAuditReadOutageRetainsSuccessfulReceiptWithoutReexecution() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailFinalize = true;
        await fixture.ExecuteAsync();
        var receipt = fixture.Context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal);
        fixture.Store.FailFinalize = false;
        fixture.Store.FailStateRead = true;
        fixture.Restart();
        await fixture.ExecuteAsync();
        Assert.Equal(1, fixture.BusinessCalls);
        Assert.Equal(receipt, fixture.Context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal));
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        fixture.Store.FailStateRead = false;
        fixture.Jobs.State = fixture.Snapshot("Succeeded");
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        Assert.Equal(ProductHistoryEventContract.Succeeded, fixture.Store.Rows[0].Outcome);
    }

    [Fact]
    public async Task RequeueDuringAuditDatabaseOutagePreservesBusinessSuccessWithoutFinalizing() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailFinalize = true;
        await fixture.ExecuteAsync();
        fixture.Store.FailAuditRead = true;
        fixture.Restart();
        await fixture.ExecuteAsync();
        Assert.Equal(1, fixture.BusinessCalls);
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        Assert.Equal(ExportOperationContract.ExportCompletedCode, fixture.Context.GetJobParameter<string>(ExportJobParameterNames.ResultCode));
    }

    [Fact]
    public async Task LegacyExecutionGuardWithoutAuditCannotBeAdoptedAsFreshExport() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Context.SetJobParameter(ExportJobParameterNames.ExecutionStarted, true);
        var error = await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.Equal(ExportJobContract.ManualReviewRequiredCode, error.Code);
        Assert.Empty(fixture.Store.Rows);
        Assert.Equal(0, fixture.BusinessCalls);
    }

    [Fact]
    public async Task ContradictorySuccessfulReceiptCannotOverwriteFinalizedFailure() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.SeedPendingAsync(false);
        await new ProductHistoryEventService(fixture.Store, new HistoryFixedTime()).FinalizeAsync(new(fixture.Request.OperationId, ProductHistoryResult.Failed));
        fixture.Context.SetJobParameter(ExportJobParameterNames.HistoryTerminal,
            ProductHistoryTerminal.Success(fixture.Request, fixture.Context.JobId, fixture.Result()));
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync());
        Assert.Equal(ProductHistoryEventContract.Failed, fixture.Store.Rows[0].Outcome);
        Assert.Equal(0, fixture.BusinessCalls);
    }

    [Theory]
    [InlineData("Processing")]
    [InlineData("Enqueued")]
    [InlineData("Scheduled")]
    [InlineData("Awaiting")]
    [InlineData("FutureState")]
    public async Task NonterminalAndUnknownJobStatesRemainPendingEvenWithSuccessReceipt(string state) {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailFinalize = true;
        await fixture.ExecuteAsync();
        fixture.Store.FailFinalize = false;
        fixture.Jobs.State = fixture.Snapshot(state);
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
    }

    [Theory]
    [InlineData("Failed", false, "Failed")]
    [InlineData("Deleted", false, "Failed")]
    [InlineData("Failed", true, "RequiresManualReview")]
    [InlineData("Deleted", true, "RequiresManualReview")]
    [InlineData("Succeeded", false, "RequiresManualReview")]
    public async Task TerminalStateWithoutReceiptUsesConservativeEvidence(string state, bool started, string outcome) {
        var fixture = new HistoryRecoveryFixture();
        await fixture.SeedPendingAsync(started);
        fixture.Jobs.State = fixture.Snapshot(state);
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        Assert.Equal(outcome, fixture.Store.Rows[0].Outcome);
        Assert.Equal(0, fixture.BusinessCalls);
    }

    [Fact]
    public async Task ExpiredOrMissingJobStaysPending() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.SeedPendingAsync(true);
        await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
    }

    [Fact]
    public async Task MismatchedProductOperationAndStateIdentityFailClosed() {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.FailFinalize = true;
        await fixture.ExecuteAsync();
        fixture.Store.FailFinalize = false;
        var state = fixture.Snapshot("Succeeded");
        foreach (var invalid in new[] {
            state with { DatasetName = "OTHER" }, state with { DatasetName = "" },
            state with { OperationId = Guid.NewGuid() }, state with { OperationId = Guid.Empty },
            state with { ExportTarget = "S57" }, state with { CorrelationId = "other" },
            state with { Request = fixture.Request with { DatasetName = "OTHER" } },
            state with { Terminal = state.Terminal! with { StateRecordId = Guid.NewGuid() } },
            state with { Terminal = state.Terminal! with { Message = "password=secret" } },
            state with { Terminal = state.Terminal! with { ResultEdition = 999 } }
        }) {
            fixture.Jobs.State = invalid;
            await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
            Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        }
    }

    [Fact]
    public async Task DuplicateOperationIdentityForDifferentProductOrJobCannotExecute() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.SeedPendingAsync(false);
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync(fixture.Request with { DatasetName = "OTHER" }));
        var otherContext = new HistoryExecutionContext { JobId = "other-job" };
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.Producer.ExecuteAsync(fixture.Request, otherContext,
            _ => throw new Exception("Business execution must not be reached.")));
        Assert.Single(fixture.Store.Rows);
        Assert.Equal(0, fixture.BusinessCalls);
    }

    [Fact]
    public async Task ReconciliationCannotFinalizeWhileProductLockIsHeld() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.SeedPendingAsync(true);
        fixture.Jobs.State = fixture.Snapshot("Failed");
        await using (var held = await fixture.Locks.TryAcquireAsync("track", CancellationToken.None)) {
            await fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None);
            Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        }
        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None)));
        Assert.Equal(1, fixture.Store.FinalizationCount);
    }

    [Fact]
    public async Task UnknownOldestRowDoesNotStarveLaterPendingPage() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.SeedPendingAsync(false);
        var unknown = fixture.Store.Rows[0];
        var second = unknown with { Id = Guid.NewGuid(), OperationId = Guid.NewGuid(), JobId = "second-job", CreatedAtUtc = unknown.CreatedAtUtc.AddSeconds(1) };
        await fixture.Store.InsertPendingAsync(second);
        fixture.Jobs.ById[second.JobId!] = fixture.Snapshot("Failed") with {
            OperationId = second.OperationId, Request = fixture.Request with { OperationId = second.OperationId }
        };
        await fixture.Reconciler.RunAsync(CancellationToken.None);
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        Assert.Equal(ProductHistoryEventContract.Failed, fixture.Store.Rows[1].Outcome);
        Assert.True(fixture.Store.PageCalls >= 3);
    }

    [Fact]
    public async Task ActiveExecutionAndConcurrentReconciliationRespectTheSameLock() {
        var fixture = new HistoryRecoveryFixture();
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task ExecuteHoldingLockAsync() {
            await using var handle = await fixture.Locks.TryAcquireAsync("track");
            await fixture.Producer.ExecuteAsync(fixture.Request, fixture.Context, async checkpoint => {
                await checkpoint();
                started.SetResult();
                await finish.Task;
                return fixture.Result();
            });
        }
        var execution = ExecuteHoldingLockAsync();
        await started.Task;
        fixture.Jobs.State = fixture.Snapshot("Failed");
        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => fixture.Reconciler.ReconcileAsync(fixture.Store.Rows[0], CancellationToken.None)));
        Assert.Null(fixture.Store.Rows[0].FinalizedAtUtc);
        finish.SetResult();
        await execution;
        Assert.Equal(ProductHistoryEventContract.Succeeded, fixture.Store.Rows[0].Outcome);
        Assert.Equal(1, fixture.Store.FinalizationCount);
    }

    [Fact]
    public async Task ASecondOperationCannotClaimAnotherEventsStateReference() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.ExecuteAsync();
        var otherRequest = fixture.Request with { OperationId = Guid.NewGuid() };
        var otherContext = new HistoryExecutionContext { JobId = "second-job" };
        await fixture.Producer.ExecuteAsync(otherRequest, otherContext, async start => { await start(); return fixture.Result(); });
        Assert.Equal(2, fixture.Store.Rows.Count);
        Assert.Null(fixture.Store.Rows[1].FinalizedAtUtc);
        Assert.Single(fixture.Store.Rows.Where(row => row.StateRecordId == fixture.StateId));
    }

    [Fact]
    public async Task WarningReceiptUsesReviewedMessagesAndKeepsWarningOutcome() {
        var fixture = new HistoryRecoveryFixture();
        await fixture.Producer.ExecuteAsync(fixture.Request, fixture.Context, async start => {
            await start();
            return fixture.Result() with { Warning = new("RAW_INTERNAL_CODE", "secret internal/path") };
        });
        var terminal = fixture.Context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal)!;
        Assert.Equal(ProductHistoryResult.SucceededWithWarning, terminal.Result);
        Assert.DoesNotContain("secret", terminal.WarningMessage);
        Assert.Equal(ProductHistoryEventContract.SucceededWithWarning, fixture.Store.Rows[0].Outcome);
    }

    [Theory]
    [InlineData(ExportOperationType.Discard)]
    [InlineData(ExportOperationType.CancelExport)]
    public async Task DiscardCannotEnterExportAuditProducer(ExportOperationType operation) {
        var fixture = new HistoryRecoveryFixture();
        await Assert.ThrowsAsync<ExportOperationJobException>(() => fixture.ExecuteAsync(fixture.Request with { OperationType = operation }));
        Assert.Empty(fixture.Store.Rows);
        Assert.Equal(0, fixture.BusinessCalls);
    }
}

internal sealed class HistoryRecoveryFixture
{
    internal HistoryRecoveryStore Store { get; } = new();
    internal HistoryExecutionContext Context { get; } = new();
    internal HistoryJobReader Jobs { get; } = new();
    internal HistoryLockService Locks { get; } = new();
    internal Guid StateId { get; } = Guid.NewGuid();
    internal ExportOperationJobRequest Request { get; } = new("101DK001", ExportOperationType.ExportEdition, "S101", 4, 2, "correlation-42", DateTimeOffset.Parse("2026-10-14T10:00:00Z"), Guid.NewGuid());
    internal ProductExportHistory Producer { get; private set; } = null!;
    internal ProductHistoryReconciliation Reconciler { get; private set; } = null!;
    internal int BusinessCalls { get; private set; }
    internal HistoryRecoveryFixture() { Store.StateId = StateId; Restart(); }
    internal void Restart() {
        var events = new ProductHistoryEventService(Store, new HistoryFixedTime());
        Producer = new(Store, events, Store, NullLogger<ProductExportHistory>.Instance);
        Reconciler = new(Store, events, Store, Jobs, Locks, new HistoryFixedTime(), NullLogger<ProductHistoryReconciliation>.Instance);
    }
    internal Task ExecuteAsync(ExportOperationJobRequest? request = null) => Producer.ExecuteAsync(request ?? Request, Context, async start => {
        Assert.Single(Store.Rows);
        await start();
        Assert.True(Context.GetJobParameter<bool?>(ExportJobParameterNames.ExecutionStarted));
        Assert.NotNull(Store.Rows[0].ExecutionStartedAtUtc);
        BusinessCalls++;
        return Result();
    });
    internal ExportOperationResult Result() => new(ExportOperationContract.ExportCompletedCode, ExportOperationContract.ExportCompletedMessage) {
        StateRecordId = StateId, DatasetName = Request.DatasetName, ExportTarget = "S101", ResultEdition = 5, ResultUpdate = 0
    };
    internal ProductHistoryJobState Snapshot(string state) => new(state, Request, Request.OperationId,
        Request.DatasetName, "S101", Request.OperationType.ToString(), Request.CorrelationId,
        Context.GetJobParameter<bool?>(ExportJobParameterNames.ExecutionStarted),
        Context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal));
    internal async Task SeedPendingAsync(bool started) {
        var events = new ProductHistoryEventService(Store, new HistoryFixedTime());
        await events.CreatePendingAsync(new(Request.OperationId, Request.DatasetName, "Export", Context.JobId, Request.CorrelationId, "S101"));
        Store.Rows[0] = Store.Rows[0] with { CreatedAtUtc = HistoryFixedTime.Now.AddHours(-1).UtcDateTime, UpdatedAtUtc = HistoryFixedTime.Now.AddHours(-1).UtcDateTime };
        if (started) {
            Context.SetJobParameter(ExportJobParameterNames.ExecutionStarted, true);
            await events.MarkExecutionStartedAsync(Request.OperationId);
        }
    }
}

internal sealed class HistoryFixedTime : TimeProvider
{
    internal static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-14T12:00:00Z");
    public override DateTimeOffset GetUtcNow() => Now;
}

internal sealed class HistoryExecutionContext : IExportJobExecutionContext
{
    internal Dictionary<string, object?> Values { get; } = [];
    public string JobId { get; init; } = "job-42";
    internal string? FailParameter { get; set; }
    public T? GetJobParameter<T>(string name) => Values.TryGetValue(name, out var value) ? (T?)value : default;
    public void SetJobParameter(string name, object? value) {
        if (name == FailParameter) throw new IOException("Injected parameter failure.");
        Values[name] = value;
    }
}

internal sealed class HistoryJobReader : IProductHistoryJobReader
{
    internal ProductHistoryJobState? State { get; set; }
    internal Dictionary<string, ProductHistoryJobState> ById { get; } = [];
    public ProductHistoryJobState? Read(string jobId) => ById.GetValueOrDefault(jobId) ?? State;
}

internal sealed class HistoryLockService : IDatasetLockService
{
    private int held;
    public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) =>
        Task.FromResult<IAsyncDisposable?>(Interlocked.CompareExchange(ref held, 1, 0) == 0 ? new Handle(this) : null);
    private sealed class Handle(HistoryLockService owner) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() { Interlocked.Exchange(ref owner.held, 0); return ValueTask.CompletedTask; }
    }
}

internal sealed class HistoryRecoveryStore : IProductHistoryEventRepository, IProductHistoryRecoveryRepository
{
    internal List<ProductHistoryEventRecord> Rows { get; } = [];
    internal Guid StateId { get; set; }
    internal bool FailInsert { get; set; }
    internal bool FailCheckpoint { get; set; }
    internal bool FailFinalize { get; set; }
    internal bool FailStateRead { get; set; }
    internal bool FailAuditRead { get; set; }
    internal int FinalizationCount { get; private set; }
    internal int PageCalls { get; private set; }
    public Task InsertPendingAsync(ProductHistoryEventRecord row) {
        lock (Rows) {
            if (FailInsert || Rows.Any(item => item.OperationId == row.OperationId)) throw new InvalidOperationException("Injected insert failure or duplicate identity.");
            Rows.Add(row);
        }
        return Task.CompletedTask;
    }
    public Task<ProductHistoryEventRecord?> GetByOperationIdAsync(Guid operationId) {
        if (FailAuditRead) throw new IOException("Injected audit read failure.");
        lock (Rows) return Task.FromResult(Rows.SingleOrDefault(row => row.OperationId == operationId));
    }
    public Task<bool> MarkExecutionStartedAsync(Guid operationId, DateTime nowUtc) {
        lock (Rows) {
            if (FailCheckpoint) throw new IOException("Injected checkpoint failure.");
            var index = Rows.FindIndex(row => row.OperationId == operationId && row.FinalizedAtUtc is null && row.ExecutionStartedAtUtc is null);
            if (index < 0) return Task.FromResult(false);
            Rows[index] = Rows[index] with { ExecutionStartedAtUtc = nowUtc, UpdatedAtUtc = nowUtc };
            return Task.FromResult(true);
        }
    }
    public Task<bool> TryFinalizeAsync(ProductHistoryEventRecord row) {
        lock (Rows) {
            if (FailFinalize) throw new IOException("Injected finalization failure.");
            var index = Rows.FindIndex(item => item.Id == row.Id && item.OperationId == row.OperationId && item.FinalizedAtUtc is null);
            if (index < 0) return Task.FromResult(false);
            Rows[index] = row;
            FinalizationCount++;
            return Task.FromResult(true);
        }
    }
    public Task<IReadOnlyList<ProductHistoryEventRecord>> GetFinalizedByDatasetNameAsync(string canonicalDatasetName) {
        lock (Rows) return Task.FromResult<IReadOnlyList<ProductHistoryEventRecord>>(Rows.Where(row => row.DatasetName == canonicalDatasetName && row.FinalizedAtUtc.HasValue).ToArray());
    }
    public Task<IReadOnlyList<ProductHistoryEventRecord>> GetPendingPageAsync(DateTime beforeUtc, DateTime? afterCreatedUtc, Guid? afterId, CancellationToken cancellationToken) {
        lock (Rows) {
            PageCalls++;
            return Task.FromResult<IReadOnlyList<ProductHistoryEventRecord>>(Rows.Where(row => row.FinalizedAtUtc is null && row.UpdatedAtUtc < beforeUtc &&
                (afterCreatedUtc is null || row.CreatedAtUtc > afterCreatedUtc || row.CreatedAtUtc == afterCreatedUtc && row.Id.CompareTo(afterId!.Value) > 0))
                .OrderBy(row => row.CreatedAtUtc).ThenBy(row => row.Id).Take(1).ToArray());
        }
    }
    public Task<bool> HasExactCompletionAsync(ProductHistoryTerminal terminal) {
        if (FailStateRead) throw new IOException("Injected state read failure.");
        return Task.FromResult(terminal.StateRecordId == StateId && terminal.DatasetName == "101DK001" && terminal.ExportTarget == "S101" &&
            terminal.ResultEdition == 5 && terminal.ResultUpdate == 0 && !Rows.Any(row => row.StateRecordId == StateId && row.OperationId != terminal.OperationId));
    }
}
