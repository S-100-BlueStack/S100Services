using Microsoft.Extensions.Configuration;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using Xunit.Abstractions;

namespace TestProductCatalogueAPI
{
    public class ProductRepositoryTests
    {
        private readonly IProductRepository _repository;
        private readonly ITestOutputHelper _output;
        public ProductRepositoryTests(ITestOutputHelper output) {
            _repository = new InMemoryProductRepository();

            _output = output;
        }

        [Fact]
        public async Task Test_AppendJobTableRow() {
            var name = "101DK0040349E";
            var state = ProductState.InTransit;
            

            // Adds or updates row
            await _repository.AppendAsync(name, state, "S-101", 1, 0, "test-user");


            // Fetch row
            var result = await _repository.GetCurrentByNameAsync(name);


            // Compare the results
            Assert.NotNull(result);
            Assert.Equal(state, result!.State);



            System.Diagnostics.Debugger.Break();
        }
    }
}
