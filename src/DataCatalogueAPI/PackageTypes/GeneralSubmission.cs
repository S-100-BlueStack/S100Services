using DataCatalague.Api.Domain;

namespace DataCatalague.Api.PackageTypes;

/// <summary>A generic submission mapped from its existing ZIP metadata and shapefile geometry.</summary>
public sealed record GeneralSubmission(PackageMetaData MetaData, PackageGeometry Geometry, PackageDescription[]? Descriptions);
