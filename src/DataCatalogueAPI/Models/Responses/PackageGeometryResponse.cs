using System.Text.Json;

namespace DataCatalague.Api.Models.V1;

/// <summary>The package's current AOI and detailed coordinates as Esri JSON objects.</summary>
/// <param name="Aoi">The stored AOI, including its spatial reference, or null when no AOI is referenced.</param>
/// <param name="DetailedGeometry">The current detail groups, or null when no points, curves or surfaces are referenced.</param>
public sealed record PackageGeometryResponse(JsonElement? Aoi, PackageDetailedGeometryResponse? DetailedGeometry);

/// <summary>Complete detailed coordinates in their stored spatial references, without merging or simplifying features.</summary>
/// <param name="Points">Every referenced point or multipoint geometry, in reference order; empty when absent.</param>
/// <param name="Curves">The multipart Esri polyline, or null when absent.</param>
/// <param name="Surfaces">The Esri polygon including all rings and holes, or null when absent.</param>
public sealed record PackageDetailedGeometryResponse(IReadOnlyList<JsonElement> Points, JsonElement? Curves, JsonElement? Surfaces);
