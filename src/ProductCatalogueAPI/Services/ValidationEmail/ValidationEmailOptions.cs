using Microsoft.Extensions.Configuration;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Separates real mailbox ingestion from synthetic response generation and complete disablement.</summary>
public enum ValidationEmailMode { Disabled, Simulation, Live }

/// <summary>Read-only Microsoft 365 polling; disabled and dry-run by default.</summary>
public sealed class ValidationEmailOptions
{
    /// <summary>Configuration section shared by API and Worker.</summary>
    public const string SectionName = "ValidationEmail";
    /// <summary>Binds the legacy section first, then applies explicitly supplied company-neutral settings.</summary>
    public static void BindSettings(IConfiguration configuration, ValidationEmailOptions options) {
        configuration.GetSection("IcEncEmail").Bind(options);
        configuration.GetSection(SectionName).Bind(options);
    }
    private ValidationEmailMode? configuredMode;
    /// <summary>Explicit Mode overrides Enabled. Simulation needs no Graph credentials and never applies live decisions.</summary>
    public ValidationEmailMode Mode { get => configuredMode ?? (Enabled ? ValidationEmailMode.Live : ValidationEmailMode.Disabled); set => configuredMode = value; }
    /// <summary>Compatibility for the first delivered package: Enabled=true means Live only when Mode is absent.</summary>
    public bool Enabled { get; set; }
    /// <summary>Prevents acknowledgement and S-128 publication for every ingestion and review action.</summary>
    public bool DryRun { get; set; } = true;
    /// <summary>Minimum minutes between completed polls; Hangfire ticks every minute.</summary>
    public int PollIntervalMinutes { get; set; } = 1;
    /// <summary>Initial history window; its start is persisted before the first Graph request.</summary>
    public int InitialLookbackDays { get; set; } = 2;
    /// <summary>Mandatory explicit live rollout barrier. Older messages require manual association.</summary>
    public DateTimeOffset? ApplyReceivedAfterUtc { get; set; }
    /// <summary>Entra tenant GUID; no credentials are stored here.</summary>
    public string TenantId { get; set; } = "";
    /// <summary>Entra application GUID with mailbox-scoped Application Mail.Read.</summary>
    public string ClientId { get; set; } = "";
    /// <summary>Certificate thumbprint in LocalMachine/My; the service identity needs private-key read access.</summary>
    public string CertificateThumbprint { get; set; } = "";
    /// <summary>Shared mailbox SMTP address or immutable user ID.</summary>
    public string Mailbox { get; set; } = "";
    /// <summary>Folder ID or well-known inbox. Changing folder creates an independent checkpoint.</summary>
    public string Folder { get; set; } = "inbox";
    /// <summary>Exact authorized SMTP addresses; display names and suffix matches are never trusted.</summary>
    public string[] AllowedSenders { get; set; } = [];
    /// <summary>Header stripped at ingress and stamped by a protected Exchange rule only for authenticated IC-ENC messages.</summary>
    public string TrustedHeaderName { get; set; } = "X-ProductCatalogue-ICENC-Verified";
    /// <summary>Exact marker value; this is a transport assertion, not a secret.</summary>
    public string TrustedHeaderValue { get; set; } = "";

    /// <summary>Fails closed for invalid polling, identities or rollout configuration.</summary>
    public bool IsValid() => Enum.IsDefined(Mode) && PollIntervalMinutes is >= 1 and <= 1440 && InitialLookbackDays is >= 1 and <= 365 &&
        (Mode != ValidationEmailMode.Live || Guid.TryParse(TenantId, out _) && Guid.TryParse(ClientId, out _) && Mailbox.Length is > 0 and <= 320 && Folder.Length is > 0 and <= 512 &&
        CertificateThumbprint.Length is >= 40 and <= 128 && AllowedSenders.Length > 0 && AllowedSenders.All(IsSmtpAddress)) &&
        (Mode != ValidationEmailMode.Live || DryRun || ApplyReceivedAfterUtc.HasValue && AllowedSenders.Length > 0 && !string.IsNullOrWhiteSpace(TrustedHeaderValue) &&
        TrustedHeaderName.StartsWith("X-", StringComparison.OrdinalIgnoreCase) && TrustedHeaderName.All(c => char.IsAsciiLetterOrDigit(c) || c == '-'));

    /// <summary>Requires an unadorned SMTP address rather than a display-name or partial-domain match.</summary>
    public static bool IsSmtpAddress(string address) => System.Net.Mail.MailAddress.TryCreate(address, out var parsed) && parsed.Address.Equals(address, StringComparison.OrdinalIgnoreCase) && address.Length <= 320;
}
