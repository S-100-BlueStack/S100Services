namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Matches historical attempts before checking current state, so stale responses cannot select a newer candidate.</summary>
public static class ValidationEmailMatcher
{
    /// <summary>Requires a single filename/format/version/checksum match across all prior transmissions.</summary>
    public static ValidationEmailMatch Match(ValidationEmailMessage message, ValidationEmailParseResult parsed, IReadOnlyList<ValidationOutgoingFile> outgoing, Guid? reviewedDeliveryId = null) {
        if (!parsed.CanMatch) return new(null, "PARSING_REQUIRES_REVIEW");
        if (!message.TrustedSender && !reviewedDeliveryId.HasValue) return new(null, "SENDER_REQUIRES_REVIEW");
        var candidates = outgoing.Where(f => f.FileName.Equals(parsed.FileName, StringComparison.OrdinalIgnoreCase) && f.Specification == parsed.Specification &&
            f.Update == parsed.Update && (!parsed.Edition.HasValue || f.Edition == parsed.Edition) &&
            DateTime.SpecifyKind(f.SentAtUtc, DateTimeKind.Utc) <= message.ReceivedAt.UtcDateTime).ToArray();
        if (reviewedDeliveryId.HasValue) candidates = candidates.Where(f => f.DeliveryId == reviewedDeliveryId).ToArray();
        if (candidates.Any(f => !f.HasManifest)) return new(null, "LEGACY_TRANSMISSION_REQUIRES_MANUAL_ACKNOWLEDGEMENT");
        if (parsed.Crc is not null) candidates = candidates.Where(f => f.Crc is not null && f.Crc.Equals(parsed.Crc, StringComparison.OrdinalIgnoreCase)).ToArray();
        // A report can be forwarded much later. Its date-only receipt field cannot prove a time zone,
        // but a report dated more than a day before reservation cannot describe that transmission.
        candidates = candidates.Where(f => !parsed.DateReceived.HasValue || parsed.DateReceived >= DateOnly.FromDateTime(f.SentAtUtc).AddDays(-1)).ToArray();
        if (candidates.Length != 1) return new(null, candidates.Length == 0 ? "NO_VERIFIED_TRANSMISSION" : "AMBIGUOUS_TRANSMISSION");
        var match = candidates[0];
        if (match.Status is not ("Delivered" or "Accepted" or "Rejected")) return new(null, "DELIVERY_REQUIRES_RECONCILIATION");
        return new(match, reviewedDeliveryId.HasValue ? "OPERATOR_VERIFIED_TRANSMISSION" : "EXACT_TRANSMISSION");
    }
}
