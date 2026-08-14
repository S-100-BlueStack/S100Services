using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Encodes one independently versioned product candidate.
/// </summary>
public interface IExportEngine
{
    /// <summary>Gets the encoding implemented by this engine.</summary>
    ExportEngineKind Kind { get; }

    /// <summary>Determines whether the engine supports a product specification.</summary>
    bool Supports(ProductSpecification productSpecification);

    /// <summary>Builds an export without mutating S-128 or workflow persistence.</summary>
    Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default);

    /// <summary>Removes filesystem output for a cancelled, unverified candidate.</summary>
    Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default);
}

/// <summary>
/// Resolves a single export engine for a product specification.
/// </summary>
public interface IExportEngineRegistry
{
    /// <summary>Gets the configured engine for a product specification.</summary>
    IExportEngine GetRequiredEngine(ProductSpecification productSpecification);
}
