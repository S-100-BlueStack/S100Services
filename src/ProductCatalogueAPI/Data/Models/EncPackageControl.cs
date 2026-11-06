namespace ProductCatalogueAPI.Data.Models;

/// <summary>
/// Stores delivery policy for an ENC source independently of its replaceable package snapshot.
/// This does not represent a workflow run or an IC-ENC delivery state.
/// </summary>
public sealed class EncPackageControlState
{
    /// <summary>The currently selected active snapshot, not a durable work identifier.</summary>
    public Guid PackageId { get; set; }
    /// <summary>The authoritative S-101 source name from the active EncPackage row.</summary>
    public string SourceDatasetName { get; set; } = string.Empty;
    /// <summary>A delivery-only policy, never a Product hold or processing gate.</summary>
    public bool IsPaused { get; set; }
    public DateTime? PausedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    /// <summary>Null means no control row has been persisted for this source.</summary>
    public byte[]? RowVersion { get; set; }
}

/// <summary>The result of a conditional internal persistence change, not a public package action.</summary>
public enum EncPackagePauseWriteStatus
{
    Changed,
    Unchanged,
    SnapshotNotFound,
    VersionConflict,
    NotEligible
}

public sealed record EncPackagePauseWriteResult(EncPackagePauseWriteStatus Status, EncPackageControlState? State);
