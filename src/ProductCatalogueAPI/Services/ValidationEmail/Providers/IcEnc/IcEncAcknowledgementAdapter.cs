using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;

/// <summary>Bridges email evidence to the same business service used by the manual acknowledgement endpoint.</summary>
public sealed class IcEncAcknowledgementAdapter(IIcEncAcknowledgementService acknowledgements) : IValidationEmailDecisionSink
{
    /// <inheritdoc/>
    public async Task<bool> ApplyAsync(Guid emailId, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) {
        return await RecordAsync(emailId, file, parsed, IcEncAcknowledgementSource.Email, cancellationToken);
    }

    /// <inheritdoc/>
    public Task<bool> ApplySimulationAsync(Guid emailId, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) =>
        file.IsSimulation ? RecordAsync(emailId, file, parsed, IcEncAcknowledgementSource.Simulation, cancellationToken) : Task.FromResult(false);

    /// <summary>Keeps provenance explicit when invoking the shared acknowledgement workflow.</summary>
    private async Task<bool> RecordAsync(Guid emailId, ValidationOutgoingFile file, ValidationEmailParseResult parsed, IcEncAcknowledgementSource source, CancellationToken cancellationToken) {
        if (parsed.Outcome is not (ValidationEmailOutcome.Accepted or ValidationEmailOutcome.Rejected)) throw new ArgumentException("A final decision is required.", nameof(parsed));
        var reason = parsed.Outcome == ValidationEmailOutcome.Rejected ? "RejectedByIC-ENC: " + parsed.Conclusion : null;
        if (reason?.Length > 1000) reason = reason[..1000];
        var result = await acknowledgements.RecordAsync(new IcEncAcknowledgement(file.DatasetName, Enum.Parse<ProductSpecification>(file.Specification), file.Edition, file.Update,
            parsed.Outcome == ValidationEmailOutcome.Accepted ? IcEncDecision.Accepted : IcEncDecision.Rejected, "IC-ENC inbound " + emailId.ToString("D"), source,
            emailId.ToString("D"), reason, file.DeliveryId), cancellationToken);
        return result is not null;
    }
}

