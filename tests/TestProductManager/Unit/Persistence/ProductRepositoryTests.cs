using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;

namespace TestProductCatalogueAPI.Unit.Persistence;

/// <summary>Exercises the in-memory product repository without SQL Server.</summary>
public sealed class ProductRepositoryTests
{
    /// <summary>Checks that the latest appended state is available through the product lookup.</summary>
    [Fact]
    public async Task AppendingStateMakesItAvailableAsCurrent() {
        const string datasetName = "101DK0040349E";
        var repository = new InMemoryProductRepository();

        await repository.AppendAsync(datasetName, ProductState.InTransit, "S-101", 1, 0, "test-user");

        var result = await repository.GetCurrentByNameAsync(datasetName);
        Assert.NotNull(result);
        Assert.Equal(ProductState.InTransit, result.State);
    }
}
