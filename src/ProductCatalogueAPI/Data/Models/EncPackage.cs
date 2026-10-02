namespace ProductCatalogueAPI.Data.Models;

/// <summary>Identifies the AOI layer used to group related export products.</summary>
public enum PackageLayer
{
    /// <summary>One S-101 AOI and its mapped S-57 and S-101 products.</summary>
    ENC = 1
}

/// <summary>Represents the active, shared source snapshot and lifecycle of an ENC package.</summary>
public sealed class EncPackage
{
    /// <summary>Gets or sets the package identifier.</summary>
    public Guid Id { get; set; }
    /// <summary>Gets or sets the S-101 AOI and source dataset name.</summary>
    public string SourceDatasetName { get; set; } = string.Empty;
    /// <summary>Gets or sets the mapped S-57 product name.</summary>
    public string S57DatasetName { get; set; } = string.Empty;
    /// <summary>Gets or sets the scan lower bound retained only when DPC replaces a ready package.</summary>
    public DateTime ScanFromUtc { get; set; }
    /// <summary>Gets or sets the timestamp of the source scan that created this snapshot.</summary>
    public DateTime DetectedAtUtc { get; set; }
    /// <summary>Gets or sets the YAML snapshot shared by both encoders.</summary>
    public string DatasetYaml { get; set; } = string.Empty;
    /// <summary>Gets or sets the YAML summary of the edits that triggered this package.</summary>
    public string SummaryYaml { get; set; } = string.Empty;
    /// <summary>Gets or sets whether the S-57 candidate was discarded.</summary>
    public bool S57Discarded { get; set; }
    /// <summary>Gets or sets whether the S-101 candidate was discarded.</summary>
    public bool S101Discarded { get; set; }
    /// <summary>Gets or sets a package-level failure that requires acknowledgement.</summary>
    public string? ErrorMessage { get; set; }
}
