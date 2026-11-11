namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Checks the protected transport assertion; sender display text or an allowlisted From alone is insufficient.</summary>
public static class ValidationEmailSenderTrust
{
    /// <summary>Requires an exact allowlisted from/sender pair and exactly one protected marker header.</summary>
    /// <param name="from">Unadorned From SMTP address supplied by Graph.</param>
    /// <param name="sender">Unadorned Sender SMTP address supplied by Graph.</param>
    /// <param name="headers">Original internet headers; Exchange must strip forged markers before stamping.</param>
    /// <param name="options">Administrator-approved sender list and transport marker.</param>
    /// <returns>True only for the configured assertion, which depends on protected Exchange mail-flow rules.</returns>
    public static bool IsTrusted(string from, string sender, IReadOnlyList<KeyValuePair<string, string>> headers, ValidationEmailOptions options) {
        if (!ValidationEmailOptions.IsSmtpAddress(from) || !from.Equals(sender, StringComparison.OrdinalIgnoreCase) ||
            !options.AllowedSenders.Contains(from, StringComparer.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(options.TrustedHeaderValue)) return false;
        var markers = headers.Where(h => h.Key.Equals(options.TrustedHeaderName, StringComparison.OrdinalIgnoreCase)).ToArray();
        return markers.Length == 1 && markers[0].Value.Trim() == options.TrustedHeaderValue;
    }
}
