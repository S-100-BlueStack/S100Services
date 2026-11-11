using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;

/// <summary>Parses the observed P007 and DMDLOAD templates without Outlook, Graph or an LLM.</summary>
public sealed class IcEncReportParser : IValidationEmailParser
{
    /// <summary>Maximum individual original attachment size and XML character count.</summary>
    public const int MaxAttachmentBytes = ValidationEmailLimits.MaxAttachmentBytes;
    /// <summary>Names the provider whose report protocol this adapter recognizes.</summary>
    public string ProviderName => "IC-ENC";
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(250);
    private const RegexOptions Flags = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant;
    private const string FilePattern = ValidationDatasetFile.Pattern;

    /// <summary>Recognizes a supported actual dataset filename; catalogue and auxiliary files do not match.</summary>
    public static bool IsDatasetFile(string name) => Regex.IsMatch(name, "^(?:" + FilePattern + ")$", Flags, Timeout);

    /// <summary>Conservative relevance gate; full classification still checks the entire template.</summary>
    public static bool IsRelevantSubject(string subject) => subject.TrimStart().StartsWith("CELL REGISTRATION", StringComparison.OrdinalIgnoreCase) || subject.TrimStart().StartsWith("VALIDATION OF CELL", StringComparison.OrdinalIgnoreCase);

    bool IValidationEmailParser.IsRelevantSubject(string subject) => IsRelevantSubject(subject);
    bool IValidationEmailParser.IsRelevantAttachment(string name) => IsRelevantAttachment(name);

    /// <summary>Returns explicit diagnostics instead of applying any state transition.</summary>
    /// <param name="message">Bounded input from a transport adapter or offline replay.</param>
    /// <returns>Evidence with CanMatch=false whenever classification or identity is unsafe.</returns>
    public ValidationEmailParseResult Parse(ValidationEmailMessage message) {
        ArgumentNullException.ThrowIfNull(message);
        try { return ParseCore(message); }
        catch (RegexMatchTimeoutException) { return new() { Diagnostics = ["PARSER_TIMEOUT_REQUIRES_REVIEW"] }; }
        catch (ArgumentException) { return new() { Diagnostics = ["MALFORMED_TEXT_REQUIRES_REVIEW"] }; }
    }

    private static ValidationEmailParseResult ParseCore(ValidationEmailMessage message) {
        var diagnostics = new List<string>();
        if (message.Subject.Length > 2048 || message.Body.Length > 256 * 1024 || message.Attachments.Count > 16 || message.Attachments.Sum(a => (long)a.Content.Length) > 16 * 1024 * 1024)
            return new() { Diagnostics = ["MESSAGE_LIMIT_EXCEEDED"] };
        var subject = NormalizeSubject(message.Subject);
        var body = ActiveBody(message.Body);
        var outcome = SubjectOutcome(subject);
        var files = Files(subject);
        if (files.Length != 1) diagnostics.Add("SUBJECT_REQUIRES_ONE_DATASET");
        var file = files.Length == 1 ? files[0] : null;
        if (Files(body).Any(name => name != file)) diagnostics.Add("MULTIPLE_DATASETS");
        if (outcome == ValidationEmailOutcome.Unknown) diagnostics.Add("UNSUPPORTED_SUBJECT");
        var crcs = Values(subject, @"\bCRC\s*[:\-]\s*([A-F0-9]{8})\b").ToList();
        int? edition = null;
        DateOnly? received = null, validated = null, release = null;
        string? conclusion = null, comments = null;
        var reports = 0;
        foreach (var attachment in message.Attachments) {
            var name = attachment.Name.ToUpperInvariant();
            if (!IsRelevantAttachment(name)) continue;
            try {
                if (attachment.Name.Length > 260 || attachment.Content.Length > MaxAttachmentBytes || attachment.Content.Length == 0)
                    throw new InvalidDataException("ATTACHMENT_LIMIT_EXCEEDED");
                var identity = Regex.Match(name, @"^(?:P007|DMDLOAD)_(.+)_(\d{3})\.(?:DOCX?|XML)$", Flags, Timeout);
                if (!identity.Success || identity.Groups[1].Value + "." + identity.Groups[2].Value != file)
                    diagnostics.Add("ATTACHMENT_FILENAME_MISMATCH");
                if (name.StartsWith("P007_", StringComparison.Ordinal)) {
                    reports++;
                    var text = ReadReport(attachment.Content);
                    var reportFiles = Files(Field(text, "Cell Name"));
                    if (reportFiles.Length != 1 || reportFiles[0] != file) diagnostics.Add("REPORT_DATASET_MISMATCH");
                    var editionText = Field(text, "Edition Number");
                    if (int.TryParse(editionText, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number >= 0) edition = number;
                    else diagnostics.Add("REPORT_EDITION_MISSING");
                    crcs.AddRange(Values(text, @"\bCRC\s*[:\-]\s*([A-F0-9]{8})\b"));
                    received = Date(Field(text, "Date Received"));
                    validated = Date(Field(text, "Date Validated"));
                    conclusion = Section(text, "Validation Conclusion", "Validation Comments");
                    comments = Section(text, "Validation Comments", null);
                    if (ReportOutcome(conclusion ?? "") != outcome) diagnostics.Add("SUBJECT_REPORT_CONFLICT");
                    release = ReleaseDate(conclusion ?? "");
                }
                else {
                    using var stream = new MemoryStream(attachment.Content, false);
                    var xml = LoadXml(stream);
                    var cells = xml.Descendants("Cell").ToArray();
                    if (cells.Length != 1 || ((string?)cells[0].Attribute("Name"))?.Replace('_', '.')?.ToUpperInvariant() != file)
                        diagnostics.Add("REGISTRATION_DATASET_MISMATCH");
                    else {
                        var crc = (string?)cells[0].Attribute("CRC");
                        if (crc is not null && Regex.IsMatch(crc, "^[A-Fa-f0-9]{8}$", Flags, Timeout)) crcs.Add(crc.ToUpperInvariant());
                        var version = Regex.Match(cells[0].Value, @"Processing Edition (\d+), Update (\d+)", Flags, Timeout);
                        if (version.Success && int.TryParse(version.Groups[1].Value, out var value)) edition = value;
                        if (version.Success && file is not null && version.Groups[2].Value.TrimStart('0') != int.Parse(file[^3..], CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture).TrimStart('0'))
                            diagnostics.Add("REGISTRATION_UPDATE_MISMATCH");
                        if (cells[0].Elements("Message").Any(m => (string?)m.Attribute("Category") == "Error")) diagnostics.Add("REGISTRATION_ATTACHMENT_ERROR");
                    }
                }
            }
            catch (Exception ex) when (ex is InvalidDataException or XmlException or IOException or ArgumentException or NotSupportedException or OverflowException) {
                diagnostics.Add("MALFORMED_OR_UNSUPPORTED_ATTACHMENT");
            }
        }
        if (outcome is ValidationEmailOutcome.Accepted or ValidationEmailOutcome.Rejected or ValidationEmailOutcome.PendingConditions && reports != 1)
            diagnostics.Add("REQUIRES_ONE_P007_REPORT");
        if (outcome == ValidationEmailOutcome.Accepted && ReportOutcome(body) is ValidationEmailOutcome.Rejected or ValidationEmailOutcome.PendingConditions)
            diagnostics.Add("SUBJECT_BODY_CONFLICT");
        if (outcome == ValidationEmailOutcome.Rejected && Regex.IsMatch(body, @"\bis accepted for distribution\b", Flags, Timeout)) diagnostics.Add("SUBJECT_BODY_CONFLICT");
        if (crcs.Distinct(StringComparer.Ordinal).Count() > 1) diagnostics.Add("CRC_SOURCE_CONFLICT");
        var bodyRelease = ReleaseDate(body);
        if (bodyRelease.HasValue && release.HasValue && bodyRelease != release) diagnostics.Add("RELEASE_DATE_CONFLICT");
        if (message.RetrievalProblem is not null) diagnostics.Add("INCOMPLETE_RETRIEVAL");
        var warningsOnly = diagnostics.All(d => d == "REGISTRATION_ATTACHMENT_ERROR");
        return new() {
            Outcome = outcome, FileName = file, Specification = file?.StartsWith("101", StringComparison.Ordinal) == true ? "S101" : file is null ? null : "S57",
            Edition = edition, Update = file is null ? null : int.Parse(file[^3..], CultureInfo.InvariantCulture), Crc = crcs.FirstOrDefault(),
            DateReceived = received, DateValidated = validated, ExpectedReleaseDate = release ?? bodyRelease,
            Conclusion = conclusion, Comments = comments, CanMatch = warningsOnly && file is not null && outcome != ValidationEmailOutcome.Unknown,
            Diagnostics = diagnostics.Distinct().ToArray()
        };
    }

    /// <summary>Only known report types are downloaded; inline logos and trackers are ignored.</summary>
    public static bool IsRelevantAttachment(string name) => name.StartsWith("P007_", StringComparison.OrdinalIgnoreCase) || name.StartsWith("DMDLOAD_", StringComparison.OrdinalIgnoreCase);

    private static string Normalize(string value) => value.Normalize().Replace('–', '-').Replace('—', '-').Replace('−', '-').Replace('\u00a0', ' ');
    private static string NormalizeSubject(string value) {
        var normalized = Normalize(value).Replace("CRC_", "CRC:", StringComparison.OrdinalIgnoreCase);
        // Keep the old reader's exported-subject tolerance without inventing a corresponding S-101 product name.
        return Regex.Replace(normalized, @"(?<![A-Z0-9])(101[A-Z0-9_]{3,60}|[A-Z]{2}[1-6][A-Z0-9]{5})_(\d{3})(?=\s*(?:-|$))", "$1.$2", Flags, Timeout);
    }
    private static string[] Files(string value) => Regex.Matches(Normalize(value), FilePattern, Flags, Timeout).Select(m => m.Value.ToUpperInvariant()).Distinct().ToArray();
    private static string[] Values(string value, string pattern) => Regex.Matches(Normalize(value), pattern, Flags, Timeout).Select(m => m.Groups[1].Value.ToUpperInvariant()).Distinct().ToArray();
    private static string Field(string text, string label) => Regex.Match(Normalize(text), @"(?m)^\s*" + Regex.Escape(label) + @"\s*[:\-]\s*([^\r\n]+)", Flags, Timeout).Groups[1].Value.Trim();
    private static string? Section(string text, string start, string? end) {
        var index = text.IndexOf(start, StringComparison.OrdinalIgnoreCase);
        if (index < 0) return null;
        index += start.Length;
        var last = end is null ? text.Length : text.IndexOf(end, index, StringComparison.OrdinalIgnoreCase);
        if (last < 0) return null;
        return text[index..Math.Min(last, index + 16000)].Trim();
    }
    private static DateOnly? Date(string text) => DateOnly.TryParseExact(text.Trim(), "dd MMM yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;
    private static DateOnly? ReleaseDate(string text) => Date(Regex.Match(text, @"(?:DISTRIBUTION ON|released on)\s+(\d{2} [A-Za-z]{3} \d{4})", Flags, Timeout).Groups[1].Value);
    private static ValidationEmailOutcome SubjectOutcome(string subject) {
        var canonical = Regex.Replace(subject.Trim(), @"\s+", " ", Flags, Timeout).ToUpperInvariant();
        var suffix = @"(?: - CRC:\s*[A-F0-9]{8})?$";
        if (Regex.IsMatch(canonical, "^CELL REGISTRATION - SUCCESSFUL - " + FilePattern + suffix, Flags, Timeout)) return ValidationEmailOutcome.Registered;
        var match = Regex.Match(canonical, "^VALIDATION OF CELL - " + FilePattern + @" - (NOT ACCEPTED FOR DISTRIBUTION|PASSED IN HOLDING|ACCEPTED FOR DISTRIBUTION)" + suffix, Flags, Timeout);
        return match.Groups[1].Value switch {
            "NOT ACCEPTED FOR DISTRIBUTION" => ValidationEmailOutcome.Rejected,
            "PASSED IN HOLDING" => ValidationEmailOutcome.PendingConditions,
            "ACCEPTED FOR DISTRIBUTION" => ValidationEmailOutcome.Accepted,
            _ => ValidationEmailOutcome.Unknown
        };
    }
    private static ValidationEmailOutcome ReportOutcome(string text) {
        text = Normalize(text).ToUpperInvariant();
        if (text.Contains("NOT ACCEPTED FOR DISTRIBUTION", StringComparison.Ordinal)) return ValidationEmailOutcome.Rejected;
        if (text.Contains("PASSED IN HOLDING", StringComparison.Ordinal) || text.Contains("PENDING CONFIRMATION", StringComparison.Ordinal) || text.Contains("WHEN THE CONDITIONS", StringComparison.Ordinal)) return ValidationEmailOutcome.PendingConditions;
        if (Regex.IsMatch(text.Trim(), @"^ACCEPTED FOR DISTRIBUTION(?: ON \d{2} [A-Z]{3} \d{4})?$", Flags, Timeout)) return ValidationEmailOutcome.Accepted;
        return ValidationEmailOutcome.Unknown;
    }
    private static string ActiveBody(string body) {
        body = Regex.Replace(body, @"(?is)<(?:blockquote|script|style)\b[^>]*>.*?</(?:blockquote|script|style)>", " ", Flags, Timeout);
        body = WebUtility.HtmlDecode(Regex.Replace(body, "<[^>]*>", " ", Flags, Timeout));
        var cut = Regex.Match(body, @"(?im)^\s*(?:From:|>.*|On .+ wrote:|[- ]*Original Message[- ]*|The contents of this e-mail|This message was sent to)", Flags, Timeout);
        return Normalize(cut.Success ? body[..cut.Index] : body);
    }
    private static XDocument LoadXml(Stream stream) {
        using var reader = XmlReader.Create(stream, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxAttachmentBytes });
        return XDocument.Load(reader);
    }
    private static string ReadReport(byte[] content) {
        if (content.Length < 4 || content[0] != 'P' || content[1] != 'K') throw new InvalidDataException("UNSUPPORTED_REPORT_FORMAT");
        using var stream = new MemoryStream(content, false);
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
        if (zip.Entries.Count > 512 || zip.Entries.Sum(e => e.Length) > 32 * 1024 * 1024) throw new InvalidDataException("REPORT_EXPANSION_LIMIT");
        var entries = zip.Entries.Where(e => e.FullName == "word/document.xml").ToArray();
        if (entries.Length != 1 || entries[0].Length > MaxAttachmentBytes) throw new InvalidDataException("MISSING_DOCUMENT_XML");
        using var xmlStream = entries[0].Open();
        var xml = LoadXml(xmlStream);
        XNamespace word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        return Normalize(string.Join('\n', xml.Descendants(word + "p").Select(p => string.Concat(p.Descendants(word + "t").Select(t => t.Value)))));
    }
}
