using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Selects the registered compiler for a product specification.
/// </summary>
/// <param name="engines">Compilers registered for worker execution.</param>
public sealed class ExportEngineRegistry(IEnumerable<IExportEngine> engines)
{
    private readonly IExportEngine[] _engines = [.. engines];

    /// <summary>Gets the sole engine for the requested specification.</summary>
    /// <param name="productSpecification">Specification of the candidate to export or clean up.</param>
    /// <returns>The matching registered engine.</returns>
    /// <exception cref="InvalidOperationException">No engine or more than one engine supports the specification.</exception>
    public IExportEngine GetRequiredEngine(ProductSpecification productSpecification) {
        var matches = _engines.Where(engine => engine.Supports(productSpecification)).ToArray();
        return matches.Length switch {
            1 => matches[0],
            0 => throw new InvalidOperationException($"No export engine is registered for {productSpecification}."),
            _ => throw new InvalidOperationException($"Multiple export engines are registered for {productSpecification}.")
        };
    }
}
