using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;

/// <summary>Bridges email evidence to the same business service used by the manual acknowledgement endpoint.</summary>
public sealed class IcEncAcknowledgementAdapter(IIcEncAcknowledgementService acknowledgements) : IValidationEmailDecisionSink
{
    /// <inheritdoc/>
    public async Task<bool> ApplyAsync(Guid emailId, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) {
        if (parsed.Outcome is not (ValidationEmailOutcome.Accepted or ValidationEmailOutcome.Rejected)) throw new ArgumentException("A final decision is required.", nameof(parsed));
        var reason = parsed.Outcome == ValidationEmailOutcome.Rejected ? "RejectedByIC-ENC: " + parsed.Conclusion : null;
        if (reason?.Length > 1000) reason = reason[..1000];
        var result = await acknowledgements.RecordAsync(new IcEncAcknowledgement(file.DatasetName, Enum.Parse<ProductSpecification>(file.Specification), file.Edition, file.Update,
            parsed.Outcome == ValidationEmailOutcome.Accepted ? IcEncDecision.Accepted : IcEncDecision.Rejected, "IC-ENC inbound " + emailId.ToString("D"), IcEncAcknowledgementSource.Email,
            emailId.ToString("D"), reason, file.DeliveryId), cancellationToken);
        return result is not null;
    }
}

