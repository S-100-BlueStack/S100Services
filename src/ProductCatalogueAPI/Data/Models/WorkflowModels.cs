using System.Security.Cryptography;

namespace ProductCatalogueAPI.Data.Models;

/// <summary>
/// Identifies the independently versioned product output managed by an export track.
/// </summary>
public enum ProductSpecification
{
    /// <summary>An S-57 ISO/IEC 8211 dataset.</summary>
    S57,

    /// <summary>An S-101 ISO/IEC 8211 dataset represented in the S-128 catalogue.</summary>
    S101,

    /// <summary>An S-102 HDF5 bathymetric surface dataset.</summary>
    S102,

    /// <summary>An S-122 GML marine protected area dataset.</summary>
    S122
}

/// <summary>
/// Identifies an export encoding engine. Tracks using different engines have independent versions and lifecycles.
/// </summary>
public enum ExportEngineKind
{
    /// <summary>ISO/IEC 8211 encoding used by S-57 and S-101.</summary>
    IsoIec8211,

    /// <summary>HDF5 encoding used by S-102.</summary>
    Hdf5,

    /// <summary>GML encoding used by S-122.</summary>
    Gml
}

/// <summary>
/// Identifies whether a candidate advances an edition or an update number.
/// </summary>
public enum ExportRevisionType
{
    /// <summary>Creates the next edition and resets the update number to zero.</summary>
    NewEdition,

    /// <summary>Creates the next update within the current edition.</summary>
    Update
}

/// <summary>
/// Identifies durable binary or textual content associated with a product revision.
/// </summary>
public enum ProductArtifactKind
{
    /// <summary>The complete source YAML used to build a candidate.</summary>
    DatasetYaml,

    /// <summary>The accumulated YAML description of detected source changes.</summary>
    ChangeSummaryYaml,

    /// <summary>A complete exchange set produced by an export engine.</summary>
    ExchangeSet,

    /// <summary>An ISO/IEC 8211 compiler index.</summary>
    CompilerIndex,

    /// <summary>A catalogue signature.</summary>
    CatalogueSignature,

    /// <summary>A validation result or report.</summary>
    ValidationReport,

    /// <summary>A validator-produced diagnostic file such as a SevenCs VLD log or shapefile bundle.</summary>
    ValidationDiagnostic
}

/// <summary>
/// Represents the authoritative SQL workflow row for one product specification.
/// </summary>
public sealed class ProductExportTrackRecord
{
    /// <summary>Gets or sets the stable track identifier.</summary>
    public Guid Id { get; set; }

    /// <summary>Gets or sets the dataset name.</summary>
    public string DatasetName { get; set; } = string.Empty;

    /// <summary>Gets or sets the independently versioned product specification.</summary>
    public ProductSpecification ProductSpecification { get; set; }

    /// <summary>Gets or sets the engine assigned to this track.</summary>
    public ExportEngineKind Engine { get; set; }

    /// <summary>Gets or sets the current workflow state.</summary>
    public ProductState State { get; set; }

    /// <summary>Gets or sets the edition known to be publicly distributed.</summary>
    public int PublishedEdition { get; set; }

    /// <summary>Gets or sets the update known to be publicly distributed.</summary>
    public int PublishedUpdate { get; set; }

    /// <summary>Gets or sets the unverified candidate edition, when one exists.</summary>
    public int? CandidateEdition { get; set; }

    /// <summary>Gets or sets the unverified candidate update, when one exists.</summary>
    public int? CandidateUpdate { get; set; }

    /// <summary>Gets or sets the last UTC workflow update time.</summary>
    public DateTime UpdatedAtUtc { get; set; }

    /// <summary>Gets or sets the latest user-safe failure code recorded for this track.</summary>
    public string? ErrorCode { get; set; }

    /// <summary>Gets or sets the latest user-safe failure message recorded for this track.</summary>
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Describes one observed change that contributes to a daily YAML summary.
/// </summary>
public sealed record ProductChange(
    string FeatureId,
    string FeatureCode,
    string AttributePath,
    DateTime DetectedAtUtc,
    bool Deleted = false);

/// <summary>
/// Represents an open daily change summary and its normalized change entries.
/// </summary>
public sealed record ProductChangeSummary(
    Guid Id,
    Guid TrackId,
    string DatasetName,
    ProductSpecification ProductSpecification,
    DateOnly WorkDate,
    string Yaml,
    IReadOnlyList<ProductChange> Changes,
    DateTime FirstDetectedAtUtc,
    DateTime LastDetectedAtUtc);

/// <summary>
/// Carries an immutable candidate revision into the workflow repository.
/// </summary>
public sealed record ProductRevisionWrite(
    Guid TrackId,
    ExportRevisionType RevisionType,
    int Edition,
    int Update,
    string DatasetYaml,
    string? ChangeSummaryYaml,
    string? CreatedBy,
    DateTime CreatedAtUtc);

/// <summary>
/// Carries a typed artifact into durable SQL storage.
/// </summary>
public sealed record ProductArtifactWrite(
    Guid TrackId,
    Guid? RevisionId,
    ProductArtifactKind Kind,
    string FileName,
    string MediaType,
    byte[] Content,
    DateTime CreatedAtUtc,
    string? MetadataJson = null)
{
    /// <summary>Computes the SHA-256 digest persisted with this artifact.</summary>
    /// <returns>The 32-byte SHA-256 digest of <see cref="Content"/>.</returns>
    public byte[] ComputeSha256() => SHA256.HashData(Content);
}

/// <summary>Describes a downloadable diagnostic artifact without loading its content.</summary>
public sealed record ProductArtifactReference(Guid Id, Guid TrackId, ProductArtifactKind Kind, string FileName, string MediaType, DateTime CreatedAtUtc);

/// <summary>Contains one diagnostic artifact after dataset ownership has been verified.</summary>
public sealed record ProductArtifactContent(Guid Id, string FileName, string MediaType, byte[] Content);
