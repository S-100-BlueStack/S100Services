using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.ValidationEmail;
using ProductCatalogueAPI.Services.Jobs;
using System.Reflection;

namespace TestProductCatalogue;

/// <summary>Exercises the actual send job and its new optional email hook without a transport, SQL Server or ArcGIS.</summary>
public sealed class ValidationEmailSendSimulationTests
{
    /// <summary>A successful simulated send passes the validated exact version and stable job ID to email generation.</summary>
    [Theory]
    [InlineData("S57", "DK5OTERP")]
    [InlineData("S101", "101DK005OTERP")]
    public async Task SuccessfulSendSimulationCapturesVersionBoundResponse(string specification, string name) {
        var repository = DispatchProxy.Create<IProductRepository, Products>();
        var emails = new Emails();
        var delivery = new Delivery();
        var job = new UploadSingularProductJob(repository, new Settings(SendToIcEncMode.Simulation), NullLogger<UploadSingularProductJob>.Instance, delivery, delivery, emails);
        var context = new Context();
        await job.ExecuteAsync(new(name, SendToIcEncMode.Simulation, 3, 1, "trace", DateTimeOffset.UtcNow, ProductSpecification: specification), context, default);
        Assert.Equal((name, specification, 3, 1, "send:job-123"), emails.LastRequest);
        Assert.Equal(1, emails.Calls);
        Assert.Equal(0, delivery.Calls);
        Assert.Equal(SendToIcEncContract.NotDeliveredStatus, context.GetJobParameter<string>(ExportJobParameterNames.DeliveryStatus));
    }

    /// <summary>Rejected versions do not generate misleading synthetic acknowledgement evidence.</summary>
    [Fact]
    public async Task ChangedCandidateDoesNotGenerateEmail() {
        var emails = new Emails();
        var job = new UploadSingularProductJob(DispatchProxy.Create<IProductRepository, Products>(), new Settings(SendToIcEncMode.Simulation), NullLogger<UploadSingularProductJob>.Instance, simulationEmails: emails);
        await Assert.ThrowsAsync<SendToIcEncJobException>(() => job.ExecuteAsync(new("DK5OTERP", SendToIcEncMode.Simulation, 4, 1, "trace", DateTimeOffset.UtcNow), new Context(), default));
        Assert.Equal(0, emails.Calls);
    }

    /// <summary>Actual live transfers never invoke synthetic email generation even when the optional hook is registered.</summary>
    [Fact]
    public async Task LiveSendNeverGeneratesSimulation() {
        var emails = new Emails();
        var delivery = new Delivery();
        var job = new UploadSingularProductJob(DispatchProxy.Create<IProductRepository, Products>(), new Settings(SendToIcEncMode.Live), NullLogger<UploadSingularProductJob>.Instance, delivery, delivery, emails);
        await job.ExecuteAsync(new("DK5OTERP", SendToIcEncMode.Live, 3, 1, "trace", DateTimeOffset.UtcNow, ProductSpecification: "S57"), new Context(), default);
        Assert.Equal(0, emails.Calls);
        Assert.Equal(3, delivery.Calls);
    }

    /// <summary>Configured workflow simulation reaches the reserved-send coordinator and never the live transport.</summary>
    [Fact]
    public async Task ConfiguredWorkflowSimulationUsesCoordinator() {
        var workflow = new Workflow();
        var delivery = new Delivery();
        var job = new UploadSingularProductJob(DispatchProxy.Create<IProductRepository, Products>(), new Settings(SendToIcEncMode.Simulation), NullLogger<UploadSingularProductJob>.Instance, delivery, delivery, simulatedSend: workflow);
        await job.ExecuteAsync(new("DK5OTERP", SendToIcEncMode.Simulation, 3, 1, "trace", DateTimeOffset.UtcNow, ProductSpecification: "S57"), new Context(), default);
        Assert.Equal("job-123", workflow.JobId);
        Assert.Equal(1, workflow.Calls);
        Assert.Equal(0, delivery.Calls);
    }

    private sealed class Workflow : IValidationEmailSimulatedSend
    {
        public bool Enabled => true;
        public int Calls { get; private set; }
        public string? JobId { get; private set; }
        public Task SendAsync(SendToIcEncJobRequest request, string jobId, CancellationToken cancellationToken) { Calls++; JobId = jobId; return Task.CompletedTask; }
    }

    // Any unexpected repository call, especially AppendAsync, fails the test instead of silently allowing a state mutation.
    public class Products : DispatchProxy
    {
        /// <summary>Provides only the read needed to validate send simulation.</summary>
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => targetMethod?.Name == nameof(IProductRepository.GetCurrentByNameAsync)
            ? Task.FromResult<ProductRecord?>(new() { Name = (string)args![0]!, EditionNo = 3, UpdateNo = 1, State = ProductState.ReadyForDistribution })
            : throw new InvalidOperationException("Unexpected product repository call: " + targetMethod?.Name);
    }
    private sealed class Emails : IValidationEmailSimulationService
    {
        public int Calls { get; private set; }
        public (string, string?, int?, int?, string) LastRequest { get; private set; }
        public Task<ValidationEmailSimulationRecord?> GenerateAsync(string name, string? specification, int? edition, int? update, string sourceKey, CancellationToken cancellationToken) {
            Calls++;
            LastRequest = (name, specification, edition, update, sourceKey);
            return Task.FromResult<ValidationEmailSimulationRecord?>(null);
        }
    }
    private sealed class Delivery : IIcEncDeliveryRepository, IIcEncTransport
    {
        public int Calls { get; private set; }
        public Task<IcEncDelivery?> ReserveAsync(string name, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken) { Calls++; return Task.FromResult<IcEncDelivery?>(new(Guid.NewGuid(), name, specification, edition, update, [])); }
        public Task MarkDeliveredAsync(Guid id, DateTime nowUtc, CancellationToken cancellationToken) { Calls++; return Task.CompletedTask; }
        public Task<string> UploadAsync(IcEncDelivery delivery, CancellationToken cancellationToken) { Calls++; return Task.FromResult("simulation-test-no-network"); }
        public Task MarkUncertainAsync(Guid id, DateTime nowUtc, string reason, CancellationToken cancellationToken) => throw new InvalidOperationException("Unexpected uncertainty");
        public Task<bool> ReconcileAsync(Guid id, bool received, string? owner, DateTime nowUtc, CancellationToken cancellationToken) => throw new InvalidOperationException("Unexpected reconciliation");
    }
    private sealed class Settings(SendToIcEncMode mode) : IOptionsMonitor<SendToIcEncOptions>
    {
        public SendToIcEncOptions CurrentValue { get; } = new() { Mode = mode };
        public SendToIcEncOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<SendToIcEncOptions, string?> listener) => null;
    }
    private sealed class Context : IExportJobExecutionContext
    {
        private readonly Dictionary<string, object?> values = [];
        public string JobId => "job-123";
        public T? GetJobParameter<T>(string name) => values.TryGetValue(name, out var value) ? (T?)value : default;
        public void SetJobParameter(string name, object? value) => values[name] = value;
    }
}
