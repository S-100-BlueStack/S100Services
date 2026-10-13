using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Persists ENC delivery policy independently of active snapshots. Not a package-action service:
/// it does not evaluate member eligibility, authorization, or delivery concurrency.
/// </summary>
public interface IEncPackageControlRepository
{
    /// <summary>Reads the current snapshot and its source-scoped Pause policy together.</summary>
    Task<EncPackageControlState?> GetForPackageAsync(Guid packageId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Conditionally persists Pause using the exact current snapshot and the last read control version.
    /// Callers must separately enforce business eligibility before exposing a package action.
    /// </summary>
    Task<EncPackagePauseWriteResult> TrySetPausedAsync(
        Guid expectedPackageId,
        byte[]? expectedControlVersion,
        bool isPaused,
        DateTime changedAtUtc,
        CancellationToken cancellationToken = default,
        bool requirePreSend = false);
}
