using System.Collections.Concurrent;
using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Services;

/// <summary>
/// An in-memory <see cref="IProductRepository"/> used to keep the sample self-contained.
/// Replace this with a real data store in a production service.
/// </summary>
public sealed class InMemoryProductRepository : IProductRepository
{
    private readonly ConcurrentDictionary<int, Product> products = new();
    private int nextId;

    /// <summary>
    /// Initialises a new instance of the <see cref="InMemoryProductRepository"/> class
    /// and seeds it with sample data.
    /// </summary>
    public InMemoryProductRepository()
    {
        var seed = new[]
        {
            new Product
            {
                Id = 1,
                Name = "Marine chart plotter",
                Price = 1_299.00m,
                Currency = "DKK",
                Category = "Navigation",
                LastUpdatedUtc = new DateTimeOffset(2026, 1, 15, 9, 30, 0, TimeSpan.Zero),
            },
            new Product
            {
                Id = 2,
                Name = "Handheld compass",
                Price = 249.50m,
                Currency = "DKK",
                Category = "Navigation",
                LastUpdatedUtc = new DateTimeOffset(2026, 2, 3, 14, 5, 0, TimeSpan.Zero),
            },
            new Product
            {
                Id = 3,
                Name = "Depth sounder",
                Price = 3_450.00m,
                Currency = "DKK",
                Category = "Instruments",
                LastUpdatedUtc = new DateTimeOffset(2026, 3, 22, 8, 0, 0, TimeSpan.Zero),
            },
        };

        foreach (var product in seed)
        {
            this.products[product.Id] = product;
        }

        this.nextId = seed.Length;
    }

    /// <inheritdoc />
    public Task<(IReadOnlyList<Product> Items, int TotalCount)> GetPageAsync(
        int skip,
        int take,
        CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(skip);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(take);

        cancellationToken.ThrowIfCancellationRequested();

        var ordered = this.products.Values.OrderBy(product => product.Id).ToList();

        IReadOnlyList<Product> page = ordered.Skip(skip).Take(take).ToList();

        return Task.FromResult((page, ordered.Count));
    }

    /// <inheritdoc />
    public Task<Product?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        this.products.TryGetValue(id, out var product);

        return Task.FromResult(product);
    }

    /// <inheritdoc />
    public Task<Product> AddAsync(Product product, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(product);
        cancellationToken.ThrowIfCancellationRequested();

        product.Id = Interlocked.Increment(ref this.nextId);
        product.LastUpdatedUtc = DateTimeOffset.UtcNow;

        this.products[product.Id] = product;

        return Task.FromResult(product);
    }
}
