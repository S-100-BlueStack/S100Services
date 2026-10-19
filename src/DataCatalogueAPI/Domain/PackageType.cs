namespace DataCatalague.Api.Domain;

/// <summary>The implemented sources of incoming dispatcher packages.</summary>
public enum PackageType
{
    /// <summary>A package supplied using the standard package contract.</summary>
    Standard,

    /// <summary>A notice supplied using the Notices to Mariners source format.</summary>
    NoticeToMariners,
}