using Hangfire;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.ValidationEmail;
using System.Reflection;

namespace TestProductCatalogueAPI;

/// <summary>Checks acceptance-triggered worker execution and recovery without ArcGIS, SQL Server or Hangfire storage.</summary>
public sealed class IcEncImmediateFinalizationTests
{
    /// <summary>The final acceptance is awaited in either mode, including a retry with durable acceptance.</summary>
    /// <param name="source">Notice provenance determining the configured workflow mode.</param>
    /// <param name="alreadyRecorded">Whether acceptance committed during an earlier attempt.</param>
    /// <returns>Completion after the inline finalizer finishes, without queuing a second job.</returns>
    [Theory]
    [InlineData(IcEncAcknowledgementSource.Email, false)]
    [InlineData(IcEncAcknowledgementSource.Email, true)]
    [InlineData(IcEncAcknowledgementSource.Simulation, false)]
    [InlineData(IcEncAcknowledgementSource.Simulation, true)]
    public async Task BothAcceptedAwaitImmediateWorkerFinalization(IcEncAcknowledgementSource source, bool alreadyRecorded) {
        var fixture = new Fixture(source, ready: true, alreadyRecorded: alreadyRecorded);
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Finalizer.Completion = completion.Task;

        var recording = fixture.Service().RecordAsync(fixture.Notice(), default);

        Assert.Equal(fixture.PackageId, fixture.Finalizer.PackageId);
        Assert.True(fixture.Repository.Recorded);
        Assert.False(recording.IsCompleted);
        completion.SetResult();
        Assert.Same(fixture.Repository.Result, await recording);
        Assert.Equal(0, fixture.Jobs.Calls);
    }

    /// <summary>One acceptance or a rejection never invokes publication or resets the package.</summary>
    /// <param name="decision">A notice that does not complete an accepted pair.</param>
    /// <returns>Completion after recording the decision without finalization.</returns>
    [Theory]
    [InlineData(IcEncDecision.Accepted)]
    [InlineData(IcEncDecision.Rejected)]
    public async Task IncompleteAcceptanceDoesNotFinalize(IcEncDecision decision) {
        var fixture = new Fixture(IcEncAcknowledgementSource.Email, ready: false);
        await fixture.Service().RecordAsync(fixture.Notice() with { Decision = decision }, default);
        Assert.Null(fixture.Finalizer.PackageId);
        Assert.Equal(0, fixture.Jobs.Calls);
    }

    /// <summary>The API has no ArcGIS finalizer and still dispatches accepted pairs to the worker.</summary>
    [Fact]
    public async Task ApiOnlyHostQueuesWorkerFinalization() {
        var fixture = new Fixture(IcEncAcknowledgementSource.Manual, ready: true);
        await fixture.Service(worker: false).RecordAsync(fixture.Notice(), default);
        Assert.Null(fixture.Finalizer.PackageId);
        Assert.Equal(1, fixture.Jobs.Calls);
    }

    /// <summary>A failed cross-store completion preserves acceptance and schedules worker recovery.</summary>
    /// <param name="enqueueFails">Whether Hangfire is also unavailable, leaving DPC as recovery.</param>
    /// <returns>Completion with the durable decision despite recoverable infrastructure failures.</returns>
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FinalizationFailureKeepsAcceptanceRecoverable(bool enqueueFails) {
        var fixture = new Fixture(IcEncAcknowledgementSource.Email, ready: true);
        fixture.Finalizer.Completion = Task.FromException(new InvalidOperationException("S-128 unavailable"));
        fixture.Jobs.Fail = enqueueFails;
        var result = await fixture.Service().RecordAsync(fixture.Notice(), default);
        Assert.Same(fixture.Repository.Result, result);
        Assert.True(fixture.Repository.Recorded);
        Assert.Equal(1, fixture.Jobs.Calls);
    }

    /// <summary>Worker shutdown propagates cancellation after durable acceptance; DPC can resume publication.</summary>
    [Fact]
    public async Task FinalizationCancellationPropagatesWithoutUndoingAcceptance() {
        var fixture = new Fixture(IcEncAcknowledgementSource.Email, ready: true);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        fixture.Finalizer.Completion = Task.FromCanceled(cancellation.Token);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => fixture.Service().RecordAsync(fixture.Notice(), cancellation.Token));
        Assert.True(fixture.Repository.Recorded);
        Assert.Equal(0, fixture.Jobs.Calls);
    }

    /// <summary>Supplies exact notice provenance and strictly bounded in-memory collaborators.</summary>
    private sealed class Fixture
    {
        internal Guid PackageId { get; } = Guid.NewGuid();
        internal RepositoryProxy Repository { get; }
        internal JobsProxy Jobs { get; }
        internal Finalizer Finalizer { get; } = new();
        private readonly IEncPackageAcknowledgementRepository repository;
        private readonly IBackgroundJobClient jobs;
        private readonly IcEncAcknowledgementSource source;

        /// <summary>Creates a durable decision result independently of external storage.</summary>
        internal Fixture(IcEncAcknowledgementSource source, bool ready, bool alreadyRecorded = false) {
            this.source = source;
            repository = DispatchProxy.Create<IEncPackageAcknowledgementRepository, RepositoryProxy>();
            Repository = (RepositoryProxy)repository;
            Repository.Result = new(Guid.NewGuid(), PackageId, ready, alreadyRecorded);
            jobs = DispatchProxy.Create<IBackgroundJobClient, JobsProxy>();
            Jobs = (JobsProxy)jobs;
        }

        /// <summary>Creates a verified exact-version notice, including a stable email event identity.</summary>
        internal IcEncAcknowledgement Notice() => new("101DK001TEST", ProductSpecification.S101, 1, 0, IcEncDecision.Accepted,
            "test notice", source, SourceEventId: source == IcEncAcknowledgementSource.Manual ? null : "test-email");

        /// <summary>Models the worker-only optional registration without enabling ArcGIS in the API.</summary>
        internal IcEncAcknowledgementService Service(bool worker = true) => new(repository, jobs,
            new Settings(source == IcEncAcknowledgementSource.Simulation ? SendToIcEncMode.Simulation : SendToIcEncMode.Live),
            TimeProvider.System, NullLogger<IcEncAcknowledgementService>.Instance,
            Options.Create(new ValidationEmailOptions { Mode = source == IcEncAcknowledgementSource.Simulation ? ValidationEmailMode.Simulation : ValidationEmailMode.Live }),
            worker ? Finalizer : null);
    }

    /// <summary>Only recording is allowed at this boundary; unexpected persistence calls fail the test.</summary>
    public class RepositoryProxy : DispatchProxy
    {
        internal IcEncAcknowledgementResult Result { get; set; } = null!;
        internal bool Recorded { get; private set; }
        /// <summary>Simulates committed acceptance before the finalizer is invoked.</summary>
        protected override object? Invoke(MethodInfo? method, object?[]? args) {
            Assert.Equal(nameof(IEncPackageAcknowledgementRepository.RecordAsync), method?.Name);
            Recorded = true;
            return Task.FromResult<IcEncAcknowledgementResult?>(Result);
        }
    }

    /// <summary>Accepts only the expected recovery job and can simulate an unavailable job store.</summary>
    public class JobsProxy : DispatchProxy
    {
        internal int Calls { get; private set; }
        internal bool Fail { get; set; }
        /// <summary>Checks job type while recording each recovery enqueue attempt.</summary>
        protected override object? Invoke(MethodInfo? method, object?[]? args) {
            Assert.Equal(nameof(IBackgroundJobClient.Create), method?.Name);
            Assert.Equal(typeof(FinalizeEncPackageJob), Assert.IsType<Hangfire.Common.Job>(args![0]).Type);
            Calls++;
            if (Fail) throw new InvalidOperationException("Hangfire unavailable");
            return "recovery-job";
        }
    }

    /// <summary>Controls completion independently from notice recording to verify awaiting and failure handling.</summary>
    private sealed class Finalizer : IEncPackageFinalizationService
    {
        internal Guid? PackageId { get; private set; }
        internal Task Completion { get; set; } = Task.CompletedTask;
        /// <inheritdoc/>
        public Task FinalizeAsync(Guid packageId, CancellationToken cancellationToken) { PackageId = packageId; return Completion; }
        /// <inheritdoc/>
        public Task FinalizePendingAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    /// <summary>Provides stable delivery mode settings without a configuration provider.</summary>
    private sealed class Settings(SendToIcEncMode mode) : IOptionsMonitor<SendToIcEncOptions>
    {
        public SendToIcEncOptions CurrentValue { get; } = new() { Mode = mode };
        public SendToIcEncOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<SendToIcEncOptions, string?> listener) => null;
    }
}
