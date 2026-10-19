using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1;

/// <summary>Replaces all package detail groups using Esri JSON, matching the geometry format accepted during package creation.</summary>
public sealed class AddPackageGeometryRequest
{
    /// <summary>An Esri polygon with a spatial reference and nonzero area, used as the AOI fallback for point or line extents.</summary>
    [Required]
    public required string Aoi { get; init; }

    /// <summary>An Esri multipoint JSON string with a spatial reference, or null to remove point details.</summary>
    public string? Points { get; init; }

    /// <summary>An Esri polyline JSON string with a spatial reference, or null to remove curve details.</summary>
    public string? Curves { get; init; }

    /// <summary>An Esri polygon JSON string with a spatial reference, or null to remove surface details.</summary>
    public string? Surfaces { get; init; }
}
