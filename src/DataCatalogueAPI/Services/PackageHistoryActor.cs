using System.Security.Claims;

namespace DataCatalague.Api.Services;

/// <summary>Captures the identity of the initiating request without consulting AD or trusting request data.</summary>
public static class PackageHistoryActor
{
    // Only explicitly identified internal operations may use this marker. Legacy
    // events and callers without a known actor remain unattributed.
    public const string SystemActor = "System";

    public static string? FromPrincipal(ClaimsPrincipal? principal) {
        var identity = principal?.Identity;
        var name = identity?.Name;
        return identity?.IsAuthenticated == true && !string.IsNullOrWhiteSpace(name)
            ? name.Trim() : null;
    }
}
