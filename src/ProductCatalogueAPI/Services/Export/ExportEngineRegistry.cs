using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Resolves exactly one engine per product specification and rejects ambiguous registrations at startup use.
/// </summary>
public sealed class ExportEngineRegistry(IEnumerable<IExportEngine> engines) : IExportEngineRegistry
{
    private readonly IExportEngine[] _engines = [.. engines];

    /// <inheritdoc/>
    public IExportEngine GetRequiredEngine(ProductSpecification productSpecification) {
        var matches = _engines.Where(engine => engine.Supports(productSpecification)).ToArray();
        return matches.Length switch {
            1 => matches[0],
            0 => throw new InvalidOperationException($"No export engine is registered for {productSpecification}."),
            _ => throw new InvalidOperationException($"Multiple export engines are registered for {productSpecification}.")
        };
    }
}
