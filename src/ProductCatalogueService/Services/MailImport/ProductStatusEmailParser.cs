using System.Text.RegularExpressions;
using ProductCatalogueService.Models;

namespace ProductCatalogueService.Services.MailImport;

public interface IProductStatusEmailParser
{
    ParsedProductStatusEmail Parse(ImportedMailMessage mail);
}

public sealed partial class ProductStatusEmailParser : IProductStatusEmailParser
{
    public ParsedProductStatusEmail Parse(ImportedMailMessage mail) {
        ArgumentNullException.ThrowIfNull(mail);

        var normalizedSubject = NormalizeSubject(mail.Subject);

        var category = ParseCategory(normalizedSubject);
        var outcome = ParseOutcome(normalizedSubject);
        var registrationId = ParseRegistrationId(normalizedSubject);
        var (crc, isCatalog) = ParseCrcOrCatalog(normalizedSubject);
        var documentAttachment = FindDocumentAttachment(mail.Attachments);

        var isRelevant =
            category is ProductStatusEmailCategory.CellRegistration or ProductStatusEmailCategory.ValidationOfCell;

        return new ParsedProductStatusEmail(
            FilePath: mail.FilePath,
            OriginalSubject: mail.Subject,
            Category: isRelevant ? category : ProductStatusEmailCategory.Other,
            Outcome: outcome,
            RegistrationId: registrationId,
            Crc: crc,
            IsCatalog: isCatalog,
            DocumentAttachment: documentAttachment,
            IsRelevant: isRelevant);
    }

    private static ProductStatusEmailCategory ParseCategory(string subject) {
        if (subject.Contains("CELL REGISTRATION", StringComparison.OrdinalIgnoreCase)) {
            return ProductStatusEmailCategory.CellRegistration;
        }

        if (subject.Contains("VALIDATION OF CELL", StringComparison.OrdinalIgnoreCase)) {
            return ProductStatusEmailCategory.ValidationOfCell;
        }

        return ProductStatusEmailCategory.Other;
    }

    private static ProductStatusEmailOutcome ParseOutcome(string subject) {
        if (subject.Contains("NOT ACCEPTED FOR DISTRIBUTION", StringComparison.OrdinalIgnoreCase)) {
            return ProductStatusEmailOutcome.NotAcceptedForDistribution;
        }

        if (subject.Contains("ACCEPTED FOR DISTRIBUTION", StringComparison.OrdinalIgnoreCase)) {
            return ProductStatusEmailOutcome.AcceptedForDistribution;
        }

        if (subject.Contains("FAILURE TO REGISTER", StringComparison.OrdinalIgnoreCase)) {
            return ProductStatusEmailOutcome.FailureToRegister;
        }

        if (subject.Contains("PASSED IN HOLDING", StringComparison.OrdinalIgnoreCase)) {
            return ProductStatusEmailOutcome.PassedInHolding;
        }

        if (subject.Contains("SUCCESSFUL", StringComparison.OrdinalIgnoreCase)) {
            return ProductStatusEmailOutcome.Successful;
        }

        return ProductStatusEmailOutcome.Unknown;
    }

    private static string? ParseRegistrationId(string subject) {
        var match = RegistrationIdRegex().Match(subject);
        return match.Success ? match.Groups["registrationId"].Value : null;
    }

    private static (string? Crc, bool IsCatalog) ParseCrcOrCatalog(string subject) {
        if (subject.Contains("CATALOG", StringComparison.OrdinalIgnoreCase)) {
            return (null, true);
        }

        var match = CrcRegex().Match(subject);
        if (match.Success) {
            return (match.Groups["crc"].Value, false);
        }

        return (null, false);
    }

    private static ImportedMailAttachment? FindDocumentAttachment(IReadOnlyList<ImportedMailAttachment> attachments) {
        var allowedExtensions = new List<string> { ".doc", ".docx", ".pdf", ".xml" };
        return attachments.FirstOrDefault(x =>
            !x.IsInline &&
            !x.IsEmbeddedMessage &&
            allowedExtensions.Any(z => string.Equals(Path.GetExtension(x.FileName), z, StringComparison.OrdinalIgnoreCase)));
    }

    private static string NormalizeSubject(string subject) {
        if (string.IsNullOrWhiteSpace(subject)) {
            return string.Empty;
        }

        var normalized = subject.Trim();

        // Normalize dash variants often introduced by copy/export.
        normalized = normalized
            .Replace('–', '-')
            .Replace('—', '-')
            .Replace('−', '-');

        // Normalize suspicious separators seen in exported samples.
        normalized = normalized.Replace("CRC_", "CRC:", StringComparison.OrdinalIgnoreCase);

        // Registration ids are expected like DKxxxxxxx.001
        normalized = Regex.Replace(
            normalized,
            @"\b(DK[A-Z0-9]+)_(\d{3})\b",
            "$1.$2",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant,
            TimeSpan.FromSeconds(2));

        // Ensure consistent spacing around colon after CRC.
        normalized = Regex.Replace(
            normalized,
            @"CRC\s*:\s*",
            "CRC: ",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant,
            TimeSpan.FromSeconds(2));

        // Collapse whitespace.
        normalized = Regex.Replace(
            normalized,
            @"\s+",
            " ",
            RegexOptions.CultureInvariant,
            TimeSpan.FromSeconds(2));

        return normalized.Trim();
    }

    [GeneratedRegex(@"\b(?<registrationId>DK[A-Z0-9]+\.\d{3})\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex RegistrationIdRegex();

    [GeneratedRegex(@"\bCRC\s*:\s*(?<crc>[A-F0-9]{8})\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex CrcRegex();
}