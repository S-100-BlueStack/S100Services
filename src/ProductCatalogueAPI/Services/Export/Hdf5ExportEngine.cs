using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Defines the S-102 HDF5 engine boundary without inventing an encoder implementation.
/// </summary>
public sealed class Hdf5ExportEngine : IExportEngine
{
    /// <inheritdoc/>
    public ExportEngineKind Kind => ExportEngineKind.Hdf5;

    /// <inheritdoc/>
    public bool Supports(ProductSpecification productSpecification) => productSpecification == ProductSpecification.S102;

    /// <inheritdoc/>
    public Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) => throw new ExportEngineNotImplementedException(request.ProductSpecification);

    /// <inheritdoc/>
    public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
