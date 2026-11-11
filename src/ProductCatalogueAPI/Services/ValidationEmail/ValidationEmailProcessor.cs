namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Audit persistence boundary, replaceable by a deterministic in-memory implementation.</summary>
public interface IValidationEmailStore
{
    /// <summary>Loads all historical attempts for this exact filename, including superseded attempts.</summary>
    Task<IReadOnlyList<ValidationOutgoingFile>> FindOutgoingAsync(string fileName, CancellationToken cancellationToken);
    /// <summary>Durably stores evidence and attaches original reports before a final acknowledgement is attempted.</summary>
    Task SaveResultAsync(Guid id, ValidationEmailProcessingResult result, IReadOnlyList<ValidationEmailAttachment> attachments, CancellationToken cancellationToken);
}

/// <summary>Adapter to the existing manual/email acknowledgement business service.</summary>
public interface IValidationEmailDecisionSink
{
    /// <summary>Returns false for a stale, non-current or conflicting delivery; repeated identical decisions are harmless.</summary>
    Task<bool> ApplyAsync(Guid emailId, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken);
    /// <summary>Applies a generated final response only to an explicitly simulated reservation.</summary>
    Task<bool> ApplySimulationAsync(Guid emailId, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) => Task.FromResult(false);
}

/// <summary>Review intent supplied by an authenticated operator, never from email text.</summary>
/// <param name="DeliveryId">Operator's verified exact send attempt.</param>
/// <param name="Reason">Mandatory audit explanation.</param>
public sealed record ValidationEmailReview(Guid DeliveryId, string Reason);

/// <summary>Coordinates durable evidence and the existing acknowledgement workflow; does not write S-128.</summary>
public sealed class ValidationEmailProcessor(IValidationEmailParser parser, IValidationEmailStore store, IValidationEmailDecisionSink decisions)
{
    /// <summary>Parses and records first, then applies only authenticated and uniquely matched final decisions.</summary>
    /// <param name="id">Stable SQL inbound identifier, also used for acknowledgement replay protection.</param>
    /// <param name="message">Original durable message.</param>
    /// <param name="dryRun">True previews decisions except explicitly authorized reserved workflow simulation.</param>
    /// <param name="applyReceivedAfterUtc">Explicit rollout barrier; historical messages require review.</param>
    /// <param name="review">Optional authenticated manual association; cannot override contradictory parsing.</param>
    /// <param name="cancellationToken">Cooperative cancellation.</param>
    /// <param name="applySimulation">Host-controlled permission for simulated sends to update their exact candidates.</param>
    /// <returns>Audit result. Infrastructure failures propagate so the pending row is retried.</returns>
    public async Task<ValidationEmailProcessingResult> ProcessAsync(Guid id, ValidationEmailMessage message, bool dryRun, DateTimeOffset? applyReceivedAfterUtc, ValidationEmailReview? review, CancellationToken cancellationToken, bool applySimulation = false) {
        if (review is not null && (review.DeliveryId == Guid.Empty || string.IsNullOrWhiteSpace(review.Reason) || review.Reason.Length > 1000))
            throw new ArgumentException("An exact delivery and a bounded review reason are required.", nameof(review));
        // Only the configured simulation host may apply generated mail, and only against durable simulation reservations.
        var simulationWorkflow = applySimulation && message.IsSimulation && message.SimulationWorkflow && message.SimulatedOutgoingFile is { IsSimulation: true };
        dryRun = simulationWorkflow ? false : dryRun || message.IsSimulation;
        var parsed = parser.Parse(message);
        IReadOnlyList<ValidationOutgoingFile> outgoing = message.IsSimulation && !simulationWorkflow
            ? message.SimulatedOutgoingFile is null ? [] : [message.SimulatedOutgoingFile]
            : parsed.CanMatch && parsed.FileName is not null ? await store.FindOutgoingAsync(parsed.FileName, cancellationToken) : [];
        outgoing = outgoing.Where(file => file.IsSimulation == message.IsSimulation || message.IsSimulation && !simulationWorkflow).ToArray();
        var match = ValidationEmailMatcher.Match(dryRun || simulationWorkflow ? message with { TrustedSender = true } : message, parsed, outgoing,
            simulationWorkflow ? message.SimulatedOutgoingFile?.DeliveryId : review?.DeliveryId);
        var result = new ValidationEmailProcessingResult("Review", match.Reason, parsed, match.File, message.IsSimulation);
        if (match.File is not null) {
            if (dryRun) result = result with { Status = "DryRun", Reason = (message.IsSimulation ? "SIMULATED_" : message.TrustedSender ? "PROPOSED_" : "UNTRUSTED_SENDER_PROPOSED_") + parsed.Outcome.ToString().ToUpperInvariant() };
            else if (!simulationWorkflow && review is null && (!applyReceivedAfterUtc.HasValue || message.ReceivedAt < applyReceivedAfterUtc)) result = result with { Reason = "HISTORICAL_MESSAGE_REQUIRES_REVIEW" };
            else if (parsed.Outcome is ValidationEmailOutcome.Registered or ValidationEmailOutcome.PendingConditions)
                result = result with { Status = parsed.Outcome == ValidationEmailOutcome.Registered && parsed.Diagnostics.Length == 0 ? "Recorded" : "Review", Reason = parsed.Outcome.ToString() };
            else if (parsed.Outcome is ValidationEmailOutcome.Accepted or ValidationEmailOutcome.Rejected)
                result = result with { Status = "Pending", Reason = "APPLYING_" + parsed.Outcome.ToString().ToUpperInvariant() };
            if (!dryRun && (match.File.Status == "Accepted" && parsed.Outcome != ValidationEmailOutcome.Accepted || match.File.Status == "Rejected" && parsed.Outcome != ValidationEmailOutcome.Rejected))
                result = result with { Status = "Review", Reason = "CONFLICTS_WITH_FINAL_DECISION" };
        }
        // Evidence and report artifacts commit before the existing cross-store publication workflow can run.
        await store.SaveResultAsync(id, result, message.Attachments, cancellationToken);
        if (result.Status != "Pending" || match.File is null) return result;
        var applied = simulationWorkflow
            ? await decisions.ApplySimulationAsync(id, match.File, parsed, cancellationToken)
            : await decisions.ApplyAsync(id, match.File, parsed, cancellationToken);
        result = result with { Status = applied ? "Applied" : "Review", Reason = applied ? "ACKNOWLEDGEMENT_RECORDED" : "STALE_OR_CONFLICTING_DECISION" };
        await store.SaveResultAsync(id, result, [], cancellationToken);
        return result;
    }
}
