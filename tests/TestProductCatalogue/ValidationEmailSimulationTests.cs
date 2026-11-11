using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;
using ProductCatalogueAPI.Services.ValidationEmail;
using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace TestProductCatalogue;

/// <summary>Verifies all sample variants, mode isolation and durable randomness without SQL, Graph or ArcGIS.</summary>
public sealed class ValidationEmailSimulationTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 10, 9, 0, 0, TimeSpan.Zero);

    /// <summary>Exercises each of the eight observed variants for both actual ENC naming formats.</summary>
    public static IEnumerable<object[]> Templates() {
        foreach (var specification in new[] { "S57", "S101" }) {
            yield return [specification, 0, 0, ValidationEmailOutcome.Registered];
            for (var index = 0; index < 4; index++) yield return [specification, 1, index, ValidationEmailOutcome.Rejected];
            yield return [specification, 2, 0, ValidationEmailOutcome.Accepted];
            for (var index = 0; index < 2; index++) yield return [specification, 3, index, ValidationEmailOutcome.PendingConditions];
        }
    }

    /// <summary>Synthetic reports use real candidate identity, edition/update and verifiable format-specific CRCs.</summary>
    [Theory]
    [MemberData(nameof(Templates))]
    public void EveryTemplateUsesNormalParserAndExactMatcher(string specification, int selection, int variant, ValidationEmailOutcome expected) {
        var candidate = Candidate(specification);
        var generator = new IcEncResponseGenerator(new RandomSequence(selection, variant));
        var message = generator.Generate(candidate, "send:123", Now);
        var parsed = new IcEncReportParser().Parse(message);
        Assert.True(message.IsSimulation);
        Assert.False(message.TrustedSender);
        Assert.Contains("SIMULATION", message.Body);
        Assert.True(parsed.CanMatch, string.Join(',', parsed.Diagnostics));
        Assert.Equal(expected, parsed.Outcome);
        Assert.Equal(candidate.Edition, parsed.Edition);
        Assert.Equal(candidate.Update, parsed.Update);
        Assert.Equal(candidate.Specification, parsed.Specification);
        Assert.Equal(candidate.RevisionId, message.SimulatedOutgoingFile!.RevisionId);
        Assert.Equal(message.SimulatedOutgoingFile.DeliveryId, ValidationEmailMatcher.Match(message with { TrustedSender = true }, parsed, [message.SimulatedOutgoingFile]).File?.DeliveryId);
        Assert.Equal(specification == "S57", parsed.Crc is not null);
        if (expected == ValidationEmailOutcome.PendingConditions || expected == ValidationEmailOutcome.Rejected && variant == 2) Assert.DoesNotContain("CRC:", message.Subject);
        if (expected == ValidationEmailOutcome.PendingConditions) Assert.Contains("accepted for distribution", message.Body);
        if (expected == ValidationEmailOutcome.Registered) Assert.Contains("REGISTRATION_ATTACHMENT_ERROR", parsed.Diagnostics);
    }

    /// <summary>Simulation provenance survives storage, mode changes, DryRun=false and explicit operator review.</summary>
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public async Task SimulatedEvidenceCanNeverReachLiveDecisionSink(int selection) {
        var original = new IcEncResponseGenerator(new RandomSequence(selection, 0)).Generate(Candidate("S57"), "request:1", Now);
        var message = JsonSerializer.Deserialize<ValidationEmailMessage>(JsonSerializer.Serialize(original))!;
        var store = new PreviewStore();
        var processor = new ValidationEmailProcessor(new IcEncReportParser(), store, new ForbiddenDecisions());
        var review = new ValidationEmailReview(message.SimulatedOutgoingFile!.DeliveryId, "Operator reviewed a synthetic response.");
        var result = await processor.ProcessAsync(Guid.NewGuid(), message, false, Now.AddDays(-1), review, default);
        Assert.Equal("DryRun", result.Status);
        Assert.True(result.IsSimulation);
        Assert.StartsWith("SIMULATED_", result.Reason);
        Assert.Equal(0, store.RealOutgoingQueries);
        Assert.Equal(1, store.AuditWrites);
    }

    /// <summary>A persistence failure after capture does not reroll the result on restart.</summary>
    [Fact]
    public async Task RetryReusesCapturedOutcomeAfterCandidateChanges() {
        var store = new SimulationStore(Candidate("S57")) { FailAfterCapture = true };
        var random = new RandomSequence(2, 1);
        var service = Service(store, random, ValidationEmailMode.Simulation);
        await Assert.ThrowsAsync<IOException>(() => service.GenerateAsync("DK5OTERP", "S57", 3, 1, "send:123", default));
        store.Candidate = Candidate("S57") with { Edition = 4 };
        var saved = await service.GenerateAsync("DK5OTERP", "S57", 3, 1, "send:123", default);
        Assert.Same(store.Records["send:123"], saved);
        Assert.Equal(ValidationEmailOutcome.Accepted, new IcEncReportParser().Parse(saved!.Message).Outcome);
        Assert.Equal(1, random.Calls);
        Assert.Single(store.Records);
    }

    /// <summary>Disabled/Live modes do not even read a candidate or consume simulation randomness.</summary>
    [Theory]
    [InlineData(ValidationEmailMode.Disabled)]
    [InlineData(ValidationEmailMode.Live)]
    public async Task SimulationDoesNothingInOtherModes(ValidationEmailMode mode) {
        var store = new SimulationStore(Candidate("S57"));
        var random = new RandomSequence(2);
        Assert.Null(await Service(store, random, mode).GenerateAsync("DK5OTERP", null, null, null, "send:1", default));
        Assert.Equal(0, random.Calls);
        Assert.Equal(0, store.Reads);
        Assert.Empty(store.Records);
    }

    /// <summary>Reusing a request ID for another product cannot silently retarget an earlier generated notice.</summary>
    [Fact]
    public async Task SimulationKeyCannotBeReassigned() {
        var store = new SimulationStore(Candidate("S57"));
        var service = Service(store, new RandomSequence(2), ValidationEmailMode.Simulation);
        await service.GenerateAsync("DK5OTERP", null, null, null, "manual:1", default);
        await Assert.ThrowsAsync<ArgumentException>(() => service.GenerateAsync("DK30557D", null, null, null, "manual:1", default));
    }

    /// <summary>Missing/rebuilt candidates produce no fabricated matching data.</summary>
    [Fact]
    public async Task MissingCandidateDoesNotGenerateResponse() {
        var store = new SimulationStore(null);
        var random = new RandomSequence(1);
        Assert.Null(await Service(store, random, ValidationEmailMode.Simulation).GenerateAsync("DK5OTERP", null, null, null, "manual:1", default));
        Assert.Empty(store.Records);
        Assert.Equal(0, random.Calls);
    }

    /// <summary>Mode takes precedence over the first delivery's Enabled alias and simulation requires no mailbox credentials.</summary>
    [Fact]
    public void SimulationConfigurationHasNoMailboxPrerequisites() {
        Assert.True(new ValidationEmailOptions { Mode = ValidationEmailMode.Simulation, DryRun = false }.IsValid());
        Assert.Equal(ValidationEmailMode.Live, new ValidationEmailOptions { Enabled = true }.Mode);
        Assert.Equal(ValidationEmailMode.Disabled, new ValidationEmailOptions { Mode = ValidationEmailMode.Disabled, Enabled = true }.Mode);
        Assert.Equal(ValidationEmailMode.Disabled, new ValidationEmailOptions { Enabled = true, Mode = ValidationEmailMode.Disabled }.Mode);
        Assert.False(new ValidationEmailOptions { Mode = (ValidationEmailMode)999 }.IsValid());
    }

    private static ValidationEmailSimulationService Service(SimulationStore store, RandomSequence random, ValidationEmailMode mode) => new(store, new IcEncResponseGenerator(random), () => mode, new FixedClock());
    private static ValidationSimulationCandidate Candidate(string specification) {
        var name = specification == "S57" ? "DK5OTERP" : "101DK005OTERP";
        using var memory = new MemoryStream();
        using (var zip = new ZipArchive(memory, ZipArchiveMode.Create, true)) {
            using var writer = new StreamWriter(zip.CreateEntry((specification == "S57" ? "ENC_ROOT/" : "S100_ROOT/") + name + ".001").Open(), new UTF8Encoding(false));
            writer.Write("123456789");
        }
        return new(Guid.NewGuid(), Guid.NewGuid(), name, specification, 3, 1, memory.ToArray());
    }
    private sealed class RandomSequence(params int[] values) : IValidationEmailSimulationRandom
    {
        public int Calls { get; private set; }
        public int Next(int upperBound) {
            var value = values[Calls++];
            Assert.InRange(value, 0, upperBound - 1);
            return value;
        }
    }
    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class SimulationStore(ValidationSimulationCandidate? candidate) : IValidationEmailSimulationStore
    {
        public ValidationSimulationCandidate? Candidate { get; set; } = candidate;
        public Dictionary<string, ValidationEmailSimulationRecord> Records { get; } = [];
        public bool FailAfterCapture { get; set; }
        public int Reads { get; private set; }
        public Task<ValidationSimulationCandidate?> GetSimulationCandidateAsync(string name, string? specification, int? edition, int? update, CancellationToken cancellationToken) { Reads++; return Task.FromResult(Candidate); }
        public Task<ValidationEmailSimulationRecord?> FindSimulationAsync(string key, CancellationToken cancellationToken) => Task.FromResult(Records.GetValueOrDefault(key));
        public Task<ValidationEmailSimulationRecord> SaveSimulationAsync(string key, ValidationEmailMessage message, CancellationToken cancellationToken) {
            Records.TryAdd(key, new(Guid.NewGuid(), message));
            if (FailAfterCapture) { FailAfterCapture = false; throw new IOException("Connection lost after durable capture"); }
            return Task.FromResult(Records[key]);
        }
    }
    private sealed class PreviewStore : IValidationEmailStore
    {
        public int RealOutgoingQueries { get; private set; }
        public int AuditWrites { get; private set; }
        public Task<IReadOnlyList<ValidationOutgoingFile>> FindOutgoingAsync(string fileName, CancellationToken cancellationToken) { RealOutgoingQueries++; throw new InvalidOperationException("Synthetic metadata must not be replaced by a live delivery lookup."); }
        public Task SaveResultAsync(Guid id, ValidationEmailProcessingResult result, IReadOnlyList<ValidationEmailAttachment> attachments, CancellationToken cancellationToken) { Assert.True(result.IsSimulation); Assert.Equal("DryRun", result.Status); AuditWrites++; return Task.CompletedTask; }
    }
    private sealed class ForbiddenDecisions : IValidationEmailDecisionSink
    {
        public Task<bool> ApplyAsync(Guid id, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) => throw new InvalidOperationException("Simulation must not apply a candidate decision.");
    }
}
