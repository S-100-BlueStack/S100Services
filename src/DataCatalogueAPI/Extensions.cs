namespace DataCatalague.Api;

/// <summary>Shared account-name normalization.</summary>
public static class Extensions
{
    /// <summary>Removes the PROD domain prefix and normalizes account-name casing.</summary>
    public static string NormalizeUserName(string user) {
        ArgumentNullException.ThrowIfNull(user);
        return user.Trim().Replace("PROD\\", string.Empty, StringComparison.OrdinalIgnoreCase).ToLowerInvariant();
    }
}
