using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Defines the S-122 GML engine boundary without inventing an encoder implementation.
/// </summary>
public sealed class GmlExportEngine : IExportEngine
{
    /// <inheritdoc/>
    public ExportEngineKind Kind => ExportEngineKind.Gml;

    /// <inheritdoc/>
    public bool Supports(ProductSpecification productSpecification) => productSpecification == ProductSpecification.S122;

    /// <inheritdoc/>
    public Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) => throw new ExportEngineNotImplementedException(request.ProductSpecification);

    /// <inheritdoc/>
    public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
