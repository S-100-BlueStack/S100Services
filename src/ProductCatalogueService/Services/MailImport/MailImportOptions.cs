namespace ProductCatalogueService.Services.MailImport;

public sealed class MailImportOptions
{
    public const string SectionName = "MailImport";

    public string SourceDirectoryPath { get; set; } = string.Empty;
    public int BatchSize { get; set; } = 100;
    public string SearchPattern { get; set; } = "*.msg";
    public bool IncludeSubdirectories { get; set; }

    public EwsOptions Ews { get; set; } = new();
}

public sealed class EwsOptions
{
    /// <summary>
    /// SMTP address or UPN of the shared mailbox.
    /// Example: shared-mailbox@contoso.com
    /// </summary>
    public string SharedMailboxAddress { get; set; } = string.Empty;

    /// <summary>
    /// Explicit EWS endpoint. If empty, Autodiscover is used.
    /// Example: https://outlook.office365.com/EWS/Exchange.asmx
    /// </summary>
    public string? ServiceUrl { get; set; }

    /// <summary>
    /// Optional override when using explicit credentials instead of default Windows credentials.
    /// Leave empty for current-user/delegate testing in an environment that supports it.
    /// </summary>
    public string? Username { get; set; }

    public string? Password { get; set; }

    public string? Domain { get; set; }

    public bool UseDefaultCredentials { get; set; } = true;

    public int PageSize { get; set; } = 100;
}