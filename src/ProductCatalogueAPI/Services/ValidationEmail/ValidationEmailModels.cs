using System.Text.Json.Serialization;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Only Accepted and Rejected are final validation decisions.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ValidationEmailOutcome>))]
public enum ValidationEmailOutcome { Unknown, Registered, Rejected, Accepted, PendingConditions }

/// <summary>Original attachment bytes; never executed or extracted to disk by the server.</summary>
/// <param name="Name">Untrusted original filename, used only as bounded metadata.</param>
/// <param name="Content">Original content, subject to ingestion size limits.</param>
public sealed record ValidationEmailAttachment(string Name, byte[] Content);

/// <summary>Transport-independent input. TrustedSender is supplied only by a verified mailbox adapter.</summary>
/// <param name="Id">Case-sensitive immutable transport identifier.</param>
/// <param name="InternetMessageId">RFC message identifier retained for audit, not trusted for authorization.</param>
/// <param name="Sender">SMTP sender address, without a display name.</param>
/// <param name="ReceivedAt">Mailbox receipt time with an explicit offset.</param>
/// <param name="Subject">Original subject.</param>
/// <param name="Body">Plain text or HTML; quoted correspondence is ignored by the parser.</param>
/// <param name="Attachments">Bounded relevant attachments.</param>
/// <param name="TrustedSender">True only after allowlist and the administrator's protected mail-flow marker checks.</param>
/// <param name="RetrievalProblem">A non-null value prevents automatic decisions on incomplete downloads.</param>
/// <param name="IsSimulation">Permanent provenance flag; generated replies may affect only marked simulation reservations while both modes are Simulation.</param>
/// <param name="SimulatedOutgoingFile">Synthetic send metadata bound to an actual immutable candidate; preview metadata or an exact permanently marked simulation reservation.</param>
public sealed record ValidationEmailMessage(string Id, string? InternetMessageId, string Sender, DateTimeOffset ReceivedAt, string Subject, string Body, IReadOnlyList<ValidationEmailAttachment> Attachments, bool TrustedSender = false, string? RetrievalProblem = null, bool IsSimulation = false, ValidationOutgoingFile? SimulatedOutgoingFile = null) {
    /// <summary>True only for generated notices belonging to a durably reserved simulated send; standalone previews remain read-only.</summary>
    public bool SimulationWorkflow { get; init; }
}

/// <summary>Extracted evidence. Calendar dates remain dates because reports provide no time zone.</summary>
public sealed record ValidationEmailParseResult
{
    /// <summary>Subject classification, cross-checked against the report.</summary>
    public ValidationEmailOutcome Outcome { get; init; }
    /// <summary>Exact normalized dataset filename including the update suffix.</summary>
    public string? FileName { get; init; }
    /// <summary>S57 or S101 inferred from supported dataset naming, never by converting names.</summary>
    public string? Specification { get; init; }
    /// <summary>Report edition; the filename suffix is never used as an edition.</summary>
    public int? Edition { get; init; }
    /// <summary>Update number extracted from the filename suffix.</summary>
    public int? Update { get; init; }
    /// <summary>Eight hexadecimal digits, from agreeing subject/report sources.</summary>
    public string? Crc { get; init; }
    /// <summary>IC-ENC's date of receipt, if present.</summary>
    public DateOnly? DateReceived { get; init; }
    /// <summary>IC-ENC's validation date, if present.</summary>
    public DateOnly? DateValidated { get; init; }
    /// <summary>Scheduled release date, kept separate from publication and IssueDate.</summary>
    public DateOnly? ExpectedReleaseDate { get; init; }
    /// <summary>Authoritative conclusion and conditional requirements, bounded for SQL.</summary>
    public string? Conclusion { get; init; }
    /// <summary>Validation comments, including corrective actions; evidence only.</summary>
    public string? Comments { get; init; }
    /// <summary>False for unsupported, contradictory or incomplete evidence.</summary>
    public bool CanMatch { get; init; }
    /// <summary>Stable diagnostic codes that do not include confidential report bodies.</summary>
    public string[] Diagnostics { get; init; } = [];
}

/// <summary>One actual outgoing dataset file tied to an immutable revision and send attempt.</summary>
/// <param name="DeliveryId">Exact send attempt.</param>
/// <param name="RevisionId">Exact candidate revision.</param>
/// <param name="TrackId">Independently versioned S-57 or S-101 product track.</param>
/// <param name="DatasetName">Canonical product name in SQL.</param>
/// <param name="Specification">S57 or S101.</param>
/// <param name="Edition">Outgoing revision edition.</param>
/// <param name="Update">Outgoing revision update.</param>
/// <param name="FileName">Actual filename in the exchange set.</param>
/// <param name="Crc">Verified S-57 CRC-32; absent for unsupported checksum schemes.</param>
/// <param name="SentAtUtc">UTC reservation time, before network transmission.</param>
/// <param name="Status">Persisted delivery status; uncertain sends require reconciliation.</param>
/// <param name="IsSimulation">Permanent send provenance used to isolate live and generated decisions.</param>
/// <param name="HasManifest">False for historical sends whose exact filename/checksum evidence was never captured; blocks automatic guesses.</param>
public sealed record ValidationOutgoingFile(Guid DeliveryId, Guid RevisionId, Guid TrackId, string DatasetName, string Specification, int Edition, int Update, string FileName, string? Crc, DateTime SentAtUtc, string Status, bool HasManifest = true, bool IsSimulation = false);

/// <summary>A deterministic match or a reason to request operator review.</summary>
/// <param name="File">Unique outgoing attempt, or null.</param>
/// <param name="Reason">Stable decision code.</param>
public sealed record ValidationEmailMatch(ValidationOutgoingFile? File, string Reason);

/// <summary>Durable processing result, including non-final acknowledgements and dry runs.</summary>
/// <param name="Status">Pending, Review, Applied, Recorded, DryRun or Dismissed.</param>
/// <param name="Reason">Stable diagnostic reason.</param>
/// <param name="Parsed">Extracted evidence.</param>
/// <param name="Match">Exact outgoing attempt when unique.</param>
/// <param name="IsSimulation">True for permanently synthetic evidence; workflow application requires Simulation mode and a simulated reservation.</param>
public sealed record ValidationEmailProcessingResult(string Status, string Reason, ValidationEmailParseResult Parsed, ValidationOutgoingFile? Match, bool IsSimulation = false);
