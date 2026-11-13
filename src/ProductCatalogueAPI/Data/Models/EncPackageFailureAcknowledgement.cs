namespace ProductCatalogueAPI.Data.Models;

/// <summary>Outcome of dismissing an exact failed ENC package, independently of provider acceptance.</summary>
public enum EncPackageFailureAcknowledgementStatus
{
    /// <summary>Both candidates and the failed package were retired atomically.</summary>
    Acknowledged,
    /// <summary>The same package was already acknowledged; no newer state was changed.</summary>
    AlreadyAcknowledged,
    /// <summary>The snapshot is missing, replaced, healthy, held or still actively building.</summary>
    Conflict
}

/// <summary>Durable acknowledgement receipt; the cutoff is not changed by retries.</summary>
/// <param name="Status">Whether this invocation committed, replayed or conflicted.</param>
/// <param name="AcknowledgedAtUtc">Exclusive source cutoff recorded with the original acknowledgement.</param>
public sealed record EncPackageFailureAcknowledgementResult(EncPackageFailureAcknowledgementStatus Status, DateTime? AcknowledgedAtUtc = null);
