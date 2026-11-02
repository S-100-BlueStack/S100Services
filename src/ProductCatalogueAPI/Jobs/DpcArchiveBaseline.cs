using System.Globalization;
using System.Text.RegularExpressions;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Defines the exclusive archive boundary after a completed import, independently of scan progress.</summary>
internal static class DpcArchiveBaseline
{
    /// <summary>The normal appsettings or environment-variable configuration key.</summary>
    internal const string ConfigurationKey = "Dpc:ArchiveBaselineUtc";
    /// <summary>The durable baseline entry in the existing system-database job state table.</summary>
    internal const string StateKey = "DetectProductChangesJob.ImportBaseline";

    /// <summary>Reads an explicit offset timestamp; blank configuration retains the persisted baseline.</summary>
    /// <param name="configuration">The Worker's normal configuration providers.</param>
    /// <param name="nowUtc">The current UTC instant used to reject future cutoffs.</param>
    /// <returns>The configured UTC boundary, or null if unspecified.</returns>
    /// <exception cref="InvalidOperationException">The value is malformed, has no offset, or is in the future.</exception>
    internal static DateTime? ReadConfigured(IConfiguration configuration, DateTime nowUtc) {
        var value = configuration[ConfigurationKey]?.Trim();
        if (string.IsNullOrEmpty(value)) return null;
        if (!Regex.IsMatch(value, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant) ||
            !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) || parsed.UtcDateTime > nowUtc)
            throw new InvalidOperationException("Dpc:ArchiveBaselineUtc must be an ISO 8601 timestamp with Z or an explicit offset, at or before the current time.");
        return parsed.UtcDateTime;
    }

    /// <summary>Retains a durable import boundary and rejects accidental backward movement.</summary>
    /// <param name="configured">The operator's explicit cutoff, if configured.</param>
    /// <param name="persisted">The previously accepted UTC baseline, if present.</param>
    /// <returns>The boundary that must constrain every archive scan.</returns>
    /// <exception cref="InvalidOperationException">Configuration would reintroduce previously excluded imported rows.</exception>
    internal static DateTime? Resolve(DateTime? configured, DateTime? persisted) {
        if (persisted.HasValue) persisted = DateTime.SpecifyKind(persisted.Value, DateTimeKind.Utc);
        if (configured < persisted)
            throw new InvalidOperationException("Dpc:ArchiveBaselineUtc cannot precede the persisted import baseline. Remove an obsolete setting or configure the latest completed import.");
        return configured ?? persisted;
    }

    /// <summary>Clamps scan, replay and package bounds without moving a later checkpoint backward.</summary>
    /// <param name="lowerBound">A normalized UTC scan or replay boundary.</param>
    /// <param name="baseline">The accepted import cutoff, if configured or persisted.</param>
    /// <returns>The later UTC instant.</returns>
    internal static DateTime Clamp(DateTime lowerBound, DateTime? baseline) => baseline.HasValue && lowerBound < baseline.Value ? baseline.Value : lowerBound;
}
