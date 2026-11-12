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

/// <summary>Deterministic paired-send eligibility, cross-platform archive and orchestration checks without external services.</summary>
public sealed class EncPackageSendSafetyTests
{
    /// <summary>Every non-Ready state on either member blocks the complete package, including both InTransit/Ready permutations.</summary>
    public static IEnumerable<object[]> States() => Enum.GetValues<ProductState>().SelectMany(state => new[] { new object[] { state, ProductState.ReadyForDistribution }, new object[] { ProductState.ReadyForDistribution, state } });

    /// <summary>Neither a valid sibling nor simulation permits sending an error, in-flight or incomplete candidate.</summary>
    [Theory]
    [MemberData(nameof(States))]
    public void BothMembersMustBeReady(ProductState s101State, ProductState s57State) {
        var package = Package();
        Assert.Equal(s101State == ProductState.ReadyForDistribution && s57State == ProductState.ReadyForDistribution,
            EncPackageSendEligibility.CanSend(package, Track(ProductSpecification.S101, s101State), Track(ProductSpecification.S57, s57State)));
    }

    /// <summary>Pause, discard, missing candidates, holds and explicit errors remain blockers despite Ready state.</summary>
    [Fact]
    public void OtherPackageGuardsCannotBeOverridden() {
        var package = Package();
        var s101 = Track(ProductSpecification.S101);
        var s57 = Track(ProductSpecification.S57);
        Assert.True(EncPackageSendEligibility.CanSend(package, s101, s57));
        package.IsPaused = true;
        Assert.False(EncPackageSendEligibility.CanSend(package, s101, s57));
        package.IsPaused = false;
        package.S57Discarded = true;
        Assert.False(EncPackageSendEligibility.CanSend(package, s101, s57));
        package.S57Discarded = false;
        s57.IsManuallyFrozen = true;
        Assert.False(EncPackageSendEligibility.CanSend(package, s101, s57));
        s57.IsManuallyFrozen = false;
        s57.ErrorCode = "SEVENCS_VALIDATION_FAILED";
        Assert.False(EncPackageSendEligibility.CanSend(package, s101, s57));
        s57.ErrorCode = null;
        s57.CandidateEdition = null;
        Assert.False(EncPackageSendEligibility.CanSend(package, s101, s57));
        Assert.False(EncPackageSendEligibility.CanSend(package, s101, null));
    }

    /// <summary>Existing S-57 artifacts with Windows separators produce the same exact filename/CRC as portable ZIPs.</summary>
    [Theory]
    [InlineData("ENC_ROOT/DK41335E.000")]
    [InlineData("ENC_ROOT\\DK41335E.000")]
    [InlineData("ENC_ROOT\\DK41335E\\DK41335E.000")]
    public void LegacyWindowsArchivePathsRemainReadable(string path) {
        var entry = Assert.Single(ValidationOutgoingManifest.Read(Zip(path), "S57", "DK41335E", 0));
        Assert.Equal("DK41335E.000", entry.FileName);
        Assert.Equal("CBF43926", entry.Crc);
    }

    /// <summary>Separator normalization must not turn mismatched, duplicate or unsafe datasets into valid deliveries.</summary>
    [Theory]
    [InlineData("ENC_ROOT\\DK30557D.000")]
    [InlineData("ENC_ROOT\\..\\DK41335E.000")]
    public void InvalidSiblingArchiveStillFailsPreflight(string path) =>
        Assert.Throws<InvalidDataException>(() => ValidationOutgoingManifest.Read(Zip(path), "S57", "DK41335E", 0));

    /// <summary>The coordinator captures both generated notices before invoking inbox processing and reuses both on retry.</summary>
    [Fact]
    public async Task PairedCoordinatorNeverUsesSingularReservationOrPollsBeforeBothReplies() {
        var repository = new PairRepository();
        var capture = new Capture();
        var inbox = new Inbox(capture);
        var random = new AlwaysAccepted();
        var coordinator = new ValidationEmailSimulatedSend(repository, capture, new IcEncResponseGenerator(random), inbox, new Settings(), Options.Create(new ValidationEmailOptions { Mode = ValidationEmailMode.Simulation }), TimeProvider.System);
        var members = repository.Deliveries.Select(d => new EncPackageSendMember(d.DatasetName, d.Specification, d.Edition, d.Update, d.RevisionId)).ToArray();
        var packageId = Guid.NewGuid();
        await coordinator.SendPackageAsync("101DK0041335E", packageId, members, "job-123", default);
        await coordinator.SendPackageAsync("101DK0041335E", packageId, members, "job-123", default);
        Assert.Equal(2, repository.Reservations);
        Assert.Equal(2, capture.Messages.Count);
        Assert.Equal(2, random.Calls);
        Assert.Equal(2, inbox.Polls);
    }

    /// <summary>Failed repository preflight produces no fake mail and never starts response processing.</summary>
    [Fact]
    public async Task FailedPairedPreflightDoesNotCaptureOrProcessAnyResponse() {
        var repository = new PairRepository { FailPreflight = true };
        var capture = new Capture();
        var inbox = new Inbox(capture);
        var coordinator = new ValidationEmailSimulatedSend(repository, capture, new IcEncResponseGenerator(new AlwaysAccepted()), inbox, new Settings(), Options.Create(new ValidationEmailOptions { Mode = ValidationEmailMode.Simulation }), TimeProvider.System);
        var members = repository.Deliveries.Select(d => new EncPackageSendMember(d.DatasetName, d.Specification, d.Edition, d.Update, d.RevisionId)).ToArray();
        await Assert.ThrowsAsync<InvalidDataException>(() => coordinator.SendPackageAsync("101DK0041335E", Guid.NewGuid(), members, "job-123", default));
        Assert.Empty(capture.Messages);
        Assert.Equal(0, inbox.Polls);
    }

    private static EncPackage Package() => new() { SourceDatasetName = "101DK0041335E", S57DatasetName = "DK41335E" };
    private static ProductExportTrackRecord Track(ProductSpecification specification, ProductState state = ProductState.ReadyForDistribution) => new() { DatasetName = specification == ProductSpecification.S101 ? "101DK0041335E" : "DK41335E", ProductSpecification = specification, State = state, CandidateEdition = 1, CandidateUpdate = 0 };
    private static byte[] Zip(string path) {
        using var memory = new MemoryStream();
        using (var zip = new ZipArchive(memory, ZipArchiveMode.Create, true)) {
            using var writer = new StreamWriter(zip.CreateEntry(path).Open(), new UTF8Encoding(false));
            writer.Write("123456789");
        }
        return memory.ToArray();
    }
    private sealed class PairRepository : IIcEncDeliveryRepository
    {
        public bool FailPreflight { get; init; }
        public int Reservations { get; private set; }
        public IcEncDelivery[] Deliveries { get; } = [Create("101DK0041335E", ProductSpecification.S101, "S100_ROOT/"), Create("DK41335E", ProductSpecification.S57, "ENC_ROOT\\")];
        private static IcEncDelivery Create(string name, ProductSpecification specification, string prefix) => new(Guid.NewGuid(), name, specification, 1, 0, Zip(prefix + name + ".000")) { RevisionId = Guid.NewGuid(), TrackId = Guid.NewGuid(), ReservedAtUtc = DateTime.UtcNow.AddMinutes(-1) };
        public Task<IReadOnlyList<IcEncDelivery>?> ReserveSimulationPackageAsync(string source, Guid packageId, IReadOnlyList<EncPackageSendMember> members, string job, DateTime now, CancellationToken cancellationToken) {
            Reservations++;
            if (FailPreflight) throw new InvalidDataException("Invalid S-57 artifact.");
            return Task.FromResult<IReadOnlyList<IcEncDelivery>?>(Deliveries);
        }
        public Task<IcEncDelivery?> ReserveAsync(string name, ProductSpecification specification, int edition, int update, string job, DateTime now, CancellationToken cancellationToken) => throw new InvalidOperationException("No singular reservation is allowed for a package.");
        public Task MarkDeliveredAsync(Guid id, DateTime now, CancellationToken cancellationToken) => throw new InvalidOperationException("The pair was committed as delivered together.");
        public Task MarkUncertainAsync(Guid id, DateTime now, string reason, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<bool> ReconcileAsync(Guid id, bool received, string? owner, DateTime now, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
    private sealed class Capture : IValidationEmailSimulationStore
    {
        public Dictionary<string, ValidationEmailSimulationRecord> Messages { get; } = [];
        public Task<ValidationSimulationCandidate?> GetSimulationCandidateAsync(string name, string? specification, int? edition, int? update, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<ValidationEmailSimulationRecord?> FindSimulationAsync(string key, CancellationToken cancellationToken) => Task.FromResult(Messages.GetValueOrDefault(key));
        public Task<ValidationEmailSimulationRecord> SaveSimulationAsync(string key, ValidationEmailMessage message, CancellationToken cancellationToken) { Messages.TryAdd(key, new(Guid.NewGuid(), message)); return Task.FromResult(Messages[key]); }
    }
    private sealed class Inbox(Capture capture) : IValidationEmailInboxProcessor
    {
        public int Polls { get; private set; }
        public Task PollAsync(CancellationToken cancellationToken) { Assert.Equal(2, capture.Messages.Count); Polls++; return Task.CompletedTask; }
    }
    private sealed class AlwaysAccepted : IValidationEmailSimulationRandom
    {
        public int Calls { get; private set; }
        public int Next(int upperBound) { Calls++; return 2; }
    }
    private sealed class Settings : IOptionsMonitor<SendToIcEncOptions>
    {
        public SendToIcEncOptions CurrentValue { get; } = new() { Mode = SendToIcEncMode.Simulation };
        public SendToIcEncOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<SendToIcEncOptions, string?> listener) => null;
    }
}
