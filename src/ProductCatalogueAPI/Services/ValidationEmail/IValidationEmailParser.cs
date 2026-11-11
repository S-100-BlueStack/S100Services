using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Provider-specific interpretation of email templates, independent of mailbox access and candidate state changes.</summary>
public interface IValidationEmailParser
{
    /// <summary>Identifies the company/protocol adapter for artifact provenance.</summary>
    string ProviderName { get; }
    /// <summary>Extracts and cross-checks identity and outcome evidence without changing state.</summary>
    ValidationEmailParseResult Parse(ValidationEmailMessage message);
    /// <summary>Identifies subjects supported by this provider's protocol.</summary>
    bool IsRelevantSubject(string subject);
    /// <summary>Identifies report attachments supported by this provider.</summary>
    bool IsRelevantAttachment(string name);
}

/// <summary>Shared intake limits independent of the external validation company.</summary>
public static class ValidationEmailLimits
{
    /// <summary>Maximum bytes per attachment and characters per parsed XML document.</summary>
    public const int MaxAttachmentBytes = 8 * 1024 * 1024;
}

/// <summary>ENC dataset naming rules belong to product formats rather than a validation provider.</summary>
public static class ValidationDatasetFile
{
    /// <summary>Supported S-57 and S-101 filenames, including their three-digit update suffix.</summary>
    public const string Pattern = @"(?<![A-Z0-9])(?:101[A-Z0-9_]{3,60}|[A-Z]{2}[1-6][A-Z0-9]{5})\.\d{3}(?![A-Z0-9])";
    /// <summary>Recognizes a complete dataset basename without accepting auxiliary/catalogue files.</summary>
    public static bool IsDatasetFile(string name) => Regex.IsMatch(name, "^(?:" + Pattern + ")$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(250));
}

/// <summary>Stable synthetic transport identity; independent of a particular provider's response text.</summary>
public static class ValidationSimulationIdentity
{
    /// <summary>Retains the existing identity algorithm so retries survive renaming and deployment.</summary>
    public static string MessageId(string sourceKey) => "simulation-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sourceKey)));
}
