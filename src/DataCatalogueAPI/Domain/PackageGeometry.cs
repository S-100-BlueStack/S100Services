namespace DataCatalague.Api.Domain;

/// <summary>Esri JSON for the rectangular AOI and complete geometry groups of an incoming package.</summary>
/// <param name="Aoi">The envelope rectangle as an Esri polygon.</param>
/// <param name="Points">All source point coordinates as an Esri multipoint, or null.</param>
/// <param name="Curves">All source line parts as an Esri polyline, or null.</param>
/// <param name="Surfaces">All source polygon rings, including holes, or null.</param>
public sealed record PackageGeometry(string Aoi, string? Points, string? Curves, string? Surfaces);