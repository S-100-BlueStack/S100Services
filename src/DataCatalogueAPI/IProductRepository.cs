using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Services;

/// <summary>
/// Provides access to the product catalogue.
/// </summary>
public interface IProductRepository
{
    /// <summary>
    /// Returns a page of products ordered by identifier.
    /// </summary>
    /// <param name="skip">The number of products to skip.</param>
    /// <param name="take">The maximum number of products to return.</param>
    /// <param name="cancellationToken">A token used to cancel the operation.</param>
    /// <returns>The requested page of products and the total number available.</returns>
    Task<(IReadOnlyList<Product> Items, int TotalCount)> GetPageAsync(
        int skip,
        int take,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns a single product.
    /// </summary>
    /// <param name="id">The identifier of the product to look up.</param>
    /// <param name="cancellationToken">A token used to cancel the operation.</param>
    /// <returns>The product, or <see langword="null"/> when no product has that identifier.</returns>
    Task<Product?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Adds a new product to the catalogue and assigns it an identifier.
    /// </summary>
    /// <param name="product">The product to add. Its identifier is ignored.</param>
    /// <param name="cancellationToken">A token used to cancel the operation.</param>
    /// <returns>The stored product, including its assigned identifier.</returns>
    Task<Product> AddAsync(Product product, CancellationToken cancellationToken = default);
}
