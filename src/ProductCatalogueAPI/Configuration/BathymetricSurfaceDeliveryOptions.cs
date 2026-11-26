using System.Text.RegularExpressions;

namespace ProductCatalogueAPI.Options;

/// <summary>Configures the independent IC-ENC intake for bathymetric surfaces.</summary>
public sealed class BathymetricSurfaceDeliveryOptions
{
    /// <summary>Configuration section shared by the API and Hangfire worker.</summary>
    public const string SectionName = "BathymetricSurfaceDelivery";

    /// <summary>Defaults to disabled until an intake or simulation is configured.</summary>
    public SendToIcEncMode Mode { get; set; }

    /// <summary>Explicit FTPS host with a trusted TLS certificate.</summary>
    public string? Host { get; set; }

    /// <summary>Port for the explicit FTPS service.</summary>
    public int Port { get; set; } = 21;

    /// <summary>Bathymetric intake account name.</summary>
    public string? Username { get; set; }

    /// <summary>FTPS credential obtained from a secret configuration provider.</summary>
    public string? Password { get; set; }

    /// <summary>Operator key required for a live submission request.</summary>
    public string? OperatorKey { get; set; }

    /// <summary>Existing directory outside the intake, where files are staged before promotion.</summary>
    public string? StagingRoot { get; set; }

    /// <summary>Existing bathymetric intake directory that receives complete exchange sets.</summary>
    public string? IntakeRoot { get; set; }

    /// <summary>Checks whether the requested mode is configured and, for live mode, the roots are disjoint.</summary>
    /// <param name="mode">Mode requested by the caller or captured in the queued job.</param>
    /// <returns>Whether this process can run a submission in the requested mode.</returns>
    internal bool CanSend(SendToIcEncMode mode) {
        if (Mode != mode)
            return false;
        if (mode == SendToIcEncMode.Simulation)
            return true;

        return mode == SendToIcEncMode.Live && !string.IsNullOrWhiteSpace(Host) && Port is > 0 and <= 65535
            && !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Password)
            && !string.IsNullOrWhiteSpace(OperatorKey)
            && IsRemoteRoot(StagingRoot) && IsRemoteRoot(IntakeRoot)
            && !string.Equals(StagingRoot, IntakeRoot, StringComparison.OrdinalIgnoreCase)
            && !StagingRoot!.StartsWith(IntakeRoot + "/", StringComparison.OrdinalIgnoreCase)
            && !IntakeRoot!.StartsWith(StagingRoot + "/", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Allows only canonical absolute FTP directories that can safely be combined with a delivery path.</summary>
    /// <param name="value">Configured directory.</param>
    /// <returns>Whether the directory is an absolute, non-root path with safe components.</returns>
    private static bool IsRemoteRoot(string? value) =>
        value is { Length: > 1 and <= 512 } && Regex.IsMatch(value, @"\A(/[a-zA-Z0-9_.-]+)+\z")
        && value.Split('/').All(part => part is not ("." or ".."));
}
