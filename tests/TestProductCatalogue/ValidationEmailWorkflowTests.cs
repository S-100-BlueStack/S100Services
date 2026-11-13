using System.IO.Compression;
using System.Text;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.ValidationEmail;
using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;

namespace TestProductCatalogue;

/// <summary>Exercises persisted simulation matching, application, mode isolation and restart recovery without infrastructure.</summary>
public sealed class ValidationEmailWorkflowTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 12, 0, 0, TimeSpan.Zero);

    /// <summary>Simulation always produces final acceptance through the normal processor, independent of the former outcome draw.</summary>
    [Theory]
    [InlineData(0, "Applied", 1)]
    [InlineData(1, "Applied", 1)]
    [InlineData(2, "Applied", 1)]
    [InlineData(3, "Applied", 1)]
    public async Task GeneratedWorkflowAlwaysProcessesAcceptance(int outcome, string status, int decisions) {
        var message = Message(outcome);
        var store = new Store(message.SimulatedOutgoingFile!);
        var sink = new Decisions();
        var processor = new ValidationEmailProcessor(new IcEncReportParser(), store, sink);
        var result = await processor.ProcessAsync(Guid.NewGuid(), message, true, null, null, default, applySimulation: true);
        Assert.Equal(status, result.Status);
        Assert.True(result.IsSimulation);
        Assert.Equal(decisions, sink.Simulated);
        Assert.Equal(0, sink.Live);
        Assert.Equal(decisions == 1 ? new[] { "Pending", "Applied" } : new[] { "Review" }, store.Writes);
    }

    /// <summary>Mode changes never promote generated evidence into live acknowledgement.</summary>
    [Fact]
    public async Task SimulationWorkflowRemainsPreviewOutsideSimulationHost() {
        var message = Message(2);
        var sink = new Decisions();
        var result = await new ValidationEmailProcessor(new IcEncReportParser(), new Store(message.SimulatedOutgoingFile!), sink)
            .ProcessAsync(Guid.NewGuid(), message, false, Now.AddDays(-1), null, default);
        Assert.Equal("DryRun", result.Status);
        Assert.Equal(0, sink.Simulated + sink.Live);
    }

    /// <summary>A synthetic report cannot accept a live transmission with the same filename and checksum.</summary>
    [Fact]
    public async Task SyntheticWorkflowCannotMatchLiveReservation() {
        var message = Message(2);
        var sink = new Decisions();
        var result = await new ValidationEmailProcessor(new IcEncReportParser(), new Store(message.SimulatedOutgoingFile! with { IsSimulation = false }), sink)
            .ProcessAsync(Guid.NewGuid(), message, false, null, null, default, applySimulation: true);
        Assert.Equal("Review", result.Status);
        Assert.Null(result.Match);
        Assert.Equal(0, sink.Simulated + sink.Live);
    }

    /// <summary>Real incoming mail cannot acknowledge a simulated transmission after modes change.</summary>
    [Fact]
    public async Task LiveMessageCannotMatchSimulatedReservation() {
        var generated = Message(2);
        var message = generated with { IsSimulation = false, SimulationWorkflow = false, SimulatedOutgoingFile = null, TrustedSender = true };
        var sink = new Decisions();
        var result = await new ValidationEmailProcessor(new IcEncReportParser(), new Store(generated.SimulatedOutgoingFile!), sink)
            .ProcessAsync(Guid.NewGuid(), message, false, Now.AddDays(-1), null, default);
        Assert.Equal("Review", result.Status);
        Assert.Equal(0, sink.Simulated + sink.Live);
    }

    /// <summary>A capture committed before connection loss is reused on the next execution without another random draw or transport.</summary>
    [Fact]
    public async Task SendRecoversAfterDurableCaptureAndDoesNotReroll() {
        var delivery = new Delivery();
        var store = new Capture { LoseConnectionAfterCapture = true };
        var random = new RandomOutcome(2);
        var inbox = new Inbox();
        var service = new ValidationEmailSimulatedSend(delivery, store, new IcEncResponseGenerator(random), inbox, new Settings(), Options.Create(new ValidationEmailOptions { Mode = ValidationEmailMode.Simulation }), new Clock());
        var request = new SendToIcEncJobRequest("DK5OTERP", SendToIcEncMode.Simulation, 3, 1, "trace", Now, ProductSpecification: "S57");
        await Assert.ThrowsAsync<IOException>(() => service.SendAsync(request, "job-123", default));
        await service.SendAsync(request, "job-123", default);
        Assert.Equal(0, random.Calls);
        Assert.Equal(1, inbox.Polls);
        Assert.Equal(2, delivery.Reservations);
        Assert.Equal(delivery.Value.Id, store.Saved!.Message.SimulatedOutgoingFile!.DeliveryId);
        Assert.True(store.Saved.Message.SimulationWorkflow);
        Assert.True(store.Saved.Message.SimulatedOutgoingFile.IsSimulation);
    }

    private static ValidationEmailMessage Message(int outcome) {
        var delivery = new Delivery().Value;
        var candidate = new ValidationSimulationCandidate(delivery.RevisionId, delivery.TrackId, delivery.DatasetName, "S57", delivery.Edition, delivery.Update, delivery.ExchangeSet);
        var generated = new IcEncResponseGenerator(new RandomOutcome(outcome)).Generate(candidate, "workflow-send:123", Now);
        return generated with { SimulationWorkflow = true, SimulatedOutgoingFile = generated.SimulatedOutgoingFile! with { IsSimulation = true } };
    }
    private sealed class RandomOutcome(int outcome) : IValidationEmailSimulationRandom
    {
        public int Calls { get; private set; }
        public int Next(int upperBound) => Calls++ == 0 ? outcome : 0;
    }
    private sealed class Store(ValidationOutgoingFile file) : IValidationEmailStore
    {
        public List<string> Writes { get; } = [];
        public Task<IReadOnlyList<ValidationOutgoingFile>> FindOutgoingAsync(string name, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<ValidationOutgoingFile>>([file]);
        public Task SaveResultAsync(Guid id, ValidationEmailProcessingResult result, IReadOnlyList<ValidationEmailAttachment> attachments, CancellationToken cancellationToken) { Writes.Add(result.Status); return Task.CompletedTask; }
    }
    private sealed class Decisions : IValidationEmailDecisionSink
    {
        public int Live { get; private set; }
        public int Simulated { get; private set; }
        public Task<bool> ApplyAsync(Guid id, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) { Live++; return Task.FromResult(true); }
        public Task<bool> ApplySimulationAsync(Guid id, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) { Assert.True(file.IsSimulation); Simulated++; return Task.FromResult(true); }
    }
    private sealed class Capture : IValidationEmailSimulationStore
    {
        public ValidationEmailSimulationRecord? Saved { get; private set; }
        public bool LoseConnectionAfterCapture { get; set; }
        public Task<ValidationSimulationCandidate?> GetSimulationCandidateAsync(string name, string? specification, int? edition, int? update, CancellationToken cancellationToken) => throw new InvalidOperationException("Use the reserved snapshot.");
        public Task<ValidationEmailSimulationRecord?> FindSimulationAsync(string key, CancellationToken cancellationToken) => Task.FromResult(Saved);
        public Task<ValidationEmailSimulationRecord> SaveSimulationAsync(string key, ValidationEmailMessage message, CancellationToken cancellationToken) {
            Saved ??= new(Guid.NewGuid(), message);
            if (LoseConnectionAfterCapture) { LoseConnectionAfterCapture = false; throw new IOException("Lost capture acknowledgement"); }
            return Task.FromResult(Saved);
        }
    }
    private sealed class Inbox : IValidationEmailInboxProcessor
    {
        public int Polls { get; private set; }
        public Task PollAsync(CancellationToken cancellationToken) { Polls++; return Task.CompletedTask; }
    }
    private sealed class Settings : IOptionsMonitor<SendToIcEncOptions>
    {
        public SendToIcEncOptions CurrentValue { get; } = new() { Mode = SendToIcEncMode.Simulation };
        public SendToIcEncOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<SendToIcEncOptions, string?> listener) => null;
    }
    private sealed class Clock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Delivery : IIcEncDeliveryRepository
    {
        public int Reservations { get; private set; }
        public IcEncDelivery Value { get; } = Create();
        private static IcEncDelivery Create() {
            using var memory = new MemoryStream();
            using (var zip = new ZipArchive(memory, ZipArchiveMode.Create, true)) {
                using var writer = new StreamWriter(zip.CreateEntry("ENC_ROOT/DK5OTERP.001").Open(), new UTF8Encoding(false));
                writer.Write("123456789");
            }
            return new(Guid.NewGuid(), "DK5OTERP", ProductSpecification.S57, 3, 1, memory.ToArray()) { RevisionId = Guid.NewGuid(), TrackId = Guid.NewGuid(), ReservedAtUtc = Now.AddSeconds(-1).UtcDateTime };
        }
        public Task<IcEncDelivery?> ReserveSimulationAsync(string name, ProductSpecification specification, int edition, int update, string jobId, DateTime now, CancellationToken cancellationToken, Guid? packageId = null, Guid? revisionId = null) { Reservations++; return Task.FromResult<IcEncDelivery?>(Value); }
        public Task<IcEncDelivery?> ReserveAsync(string name, ProductSpecification specification, int edition, int update, string jobId, DateTime now, CancellationToken cancellationToken) => throw new InvalidOperationException("No live reservation.");
        public Task MarkDeliveredAsync(Guid id, DateTime now, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task MarkUncertainAsync(Guid id, DateTime now, string reason, CancellationToken cancellationToken) => throw new InvalidOperationException("No external transport.");
        public Task<bool> ReconcileAsync(Guid id, bool received, string? owner, DateTime now, CancellationToken cancellationToken) => throw new InvalidOperationException("No external transport.");
    }
}
