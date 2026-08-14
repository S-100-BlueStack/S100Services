using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Contains all immutable input required by an export engine.
/// </summary>
public sealed record ExportEngineRequest(string DatasetName, ProductSpecification ProductSpecification, int Edition, int Update, string OutputRoot, string DatasetYaml, string? PreviousIndex = null);

/// <summary>
/// Identifies output belonging to one candidate and one independent product track.
/// </summary>
public sealed record ExportOutputIdentity(string DatasetName, ProductSpecification ProductSpecification, int Edition, int Update, string OutputRoot);

/// <summary>
/// Represents one engine-produced artifact suitable for durable SQL storage.
/// </summary>
public sealed record ExportEngineArtifact(ProductArtifactKind Kind, string FileName, string MediaType, byte[] Content, string? MetadataJson = null);

/// <summary>
/// Represents the filesystem location and durable artifacts produced by an engine.
/// </summary>
public sealed record ExportEngineResult(string OutputDirectory, IReadOnlyList<ExportEngineArtifact> Artifacts);

/// <summary>
/// Indicates that a known product/engine structure exists but its encoder is intentionally not implemented yet.
/// </summary>
public sealed class ExportEngineNotImplementedException(ProductSpecification productSpecification)
    : NotSupportedException($"The export engine for {productSpecification} has been scaffolded but is not implemented.")
{
    /// <summary>Gets the unsupported product specification.</summary>
    public ProductSpecification ProductSpecification { get; } = productSpecification;
}
