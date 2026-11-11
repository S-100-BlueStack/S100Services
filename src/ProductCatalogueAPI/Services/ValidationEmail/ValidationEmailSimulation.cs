using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Provider-specific response templates used by the isolated simulation adapter.</summary>
public interface IValidationResponseGenerator
{
    /// <summary>Creates permanently synthetic evidence for an immutable candidate and stable request key.</summary>
    ValidationEmailMessage Generate(ValidationSimulationCandidate candidate, string sourceKey, DateTimeOffset now);
}

/// <summary>Snapshot of an actual candidate; reading it never reserves a live transmission.</summary>
/// <param name="RevisionId">Immutable candidate revision.</param>
/// <param name="TrackId">Actual S-57 or S-101 track.</param>
/// <param name="DatasetName">Canonical candidate name.</param>
/// <param name="Specification">S57 or S101.</param>
/// <param name="Edition">Actual candidate edition.</param>
/// <param name="Update">Actual candidate update.</param>
/// <param name="ExchangeSet">Stored candidate ZIP used to verify its filename and checksum.</param>
public sealed record ValidationSimulationCandidate(Guid RevisionId, Guid TrackId, string DatasetName, string Specification, int Edition, int Update, byte[] ExchangeSet);

/// <summary>Durably generated synthetic notice; retries reuse its original random outcome.</summary>
/// <param name="Id">Inbound audit identifier.</param>
/// <param name="Message">Original generated message and immutable synthetic transmission metadata.</param>
public sealed record ValidationEmailSimulationRecord(Guid Id, ValidationEmailMessage Message);

/// <summary>Bounds simulation persistence to candidate reads and inbound audit records.</summary>
public interface IValidationEmailSimulationStore
{
    /// <summary>Loads one exact current candidate with a stored exchange set; null for missing, changed or ambiguous versions.</summary>
    Task<ValidationSimulationCandidate?> GetSimulationCandidateAsync(string datasetName, string? specification, int? edition, int? update, CancellationToken cancellationToken);
    /// <summary>Returns the already generated notice for an idempotency key.</summary>
    Task<ValidationEmailSimulationRecord?> FindSimulationAsync(string sourceKey, CancellationToken cancellationToken);
    /// <summary>Inserts once, preserving the winning random result under concurrent/repeated requests.</summary>
    Task<ValidationEmailSimulationRecord> SaveSimulationAsync(string sourceKey, ValidationEmailMessage message, CancellationToken cancellationToken);
}

/// <summary>Replaceable randomness for deterministic coverage of every response template.</summary>
public interface IValidationEmailSimulationRandom
{
    /// <summary>Returns an integer from zero inclusive to upperBound exclusive.</summary>
    int Next(int upperBound);
}

/// <summary>Uses independent per-call randomness without global mutable seed configuration.</summary>
public sealed class ValidationEmailSimulationRandom : IValidationEmailSimulationRandom
{
    /// <inheritdoc/>
    public int Next(int upperBound) => Random.Shared.Next(upperBound);
}

/// <summary>Optional hook for Send-To-IC-ENC simulation; disabled/live email modes return without generating evidence.</summary>
public interface IValidationEmailSimulationService
{
    /// <summary>Generates at most one random response for a source key, without creating a real delivery or changing states.</summary>
    Task<ValidationEmailSimulationRecord?> GenerateAsync(string datasetName, string? specification, int? edition, int? update, string sourceKey, CancellationToken cancellationToken);
}

/// <summary>Coordinates generation with durable deduplication; accepts no live mailbox or decision sink dependency.</summary>
public sealed class ValidationEmailSimulationService(IValidationEmailSimulationStore store, IValidationResponseGenerator generator, Func<ValidationEmailMode> mode, TimeProvider clock) : IValidationEmailSimulationService
{
    /// <inheritdoc/>
    public async Task<ValidationEmailSimulationRecord?> GenerateAsync(string datasetName, string? specification, int? edition, int? update, string sourceKey, CancellationToken cancellationToken) {
        if (mode() != ValidationEmailMode.Simulation) return null;
        if (string.IsNullOrWhiteSpace(sourceKey) || sourceKey.Length > 256) throw new ArgumentException("A bounded simulation source key is required.", nameof(sourceKey));
        var existing = await store.FindSimulationAsync(sourceKey, cancellationToken);
        if (existing is not null) {
            var original = existing.Message.SimulatedOutgoingFile;
            if (original is null || !original.DatasetName.Equals(datasetName, StringComparison.OrdinalIgnoreCase) || specification is not null && original.Specification != specification ||
                edition.HasValue && original.Edition != edition || update.HasValue && original.Update != update)
                throw new ArgumentException("The simulation request key already belongs to another candidate.", nameof(sourceKey));
            return existing;
        }
        var candidate = await store.GetSimulationCandidateAsync(datasetName, specification, edition, update, cancellationToken);
        if (candidate is null) return null;
        return await store.SaveSimulationAsync(sourceKey, generator.Generate(candidate, sourceKey, clock.GetUtcNow()), cancellationToken);
    }
}

/// <summary>Runs the send workflow with generated responses instead of external transport or mailbox access.</summary>
public interface IValidationEmailSimulatedSend
{
    /// <summary>Requires both send and email modes to be Simulation.</summary>
    bool Enabled { get; }
    /// <summary>Reserves the exact candidate, durably generates one reply and processes pending simulated mail.</summary>
    /// <param name="request">Validated output identity, candidate version and optional exact package/revision guards.</param>
    /// <param name="jobId">Stable job identity used for durable reservation and response deduplication.</param>
    /// <param name="cancellationToken">Cooperative cancellation; captured notices remain recoverable by polling.</param>
    /// <returns>Completion after the immediate simulated inbox processing attempt.</returns>
    Task SendAsync(ProductCatalogueAPI.Jobs.SendToIcEncJobRequest request, string jobId, CancellationToken cancellationToken);
}

/// <summary>Processes the durable inbound queue through the shared locking and parsing boundary.</summary>
public interface IValidationEmailInboxProcessor
{
    /// <summary>Processes pending notices for the selected mode; simulation never polls Graph.</summary>
    Task PollAsync(CancellationToken cancellationToken);
}
