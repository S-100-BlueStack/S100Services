namespace ProductManagerAPI.Services.Graph;

public enum GraphAuthenticationMode
{
    DeviceCode = 0,
    ClientSecret = 1
}

public sealed class GraphAuthOptions
{
    public const string SectionName = "Graph";

    public GraphAuthenticationMode AuthenticationMode { get; set; } = GraphAuthenticationMode.ClientSecret;

    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string? ClientSecret { get; set; }

    /// <summary>
    /// Shared mailbox SMTP address or UPN.
    /// Example: shared-mailbox@contoso.com
    /// </summary>
    public string SharedMailboxUserId { get; set; } = string.Empty;

    /// <summary>
    /// Delegated scopes are only used for local development or temporary user-login flows.
    /// App-only uses .default automatically.
    /// </summary>
    public string[] DelegatedScopes { get; set; } =
    [
        "Mail.Read.Shared",
        "Mail.Read"
    ];

    public int PageSize { get; set; } = 100;
}