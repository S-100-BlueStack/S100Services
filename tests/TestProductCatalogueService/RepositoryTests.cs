using Microsoft.Extensions.Configuration;
using ProductCatalogueService.Data.Database;
using ProductCatalogueService.Data.Models;
using ProductCatalogueService.Data.Repositories;
using Xunit.Abstractions;

namespace TestProductCatalogueService
{
    public class ProductRepositoryTests
    {
        private readonly ProductRepository _repository;
        private readonly ITestOutputHelper _output;
        public ProductRepositoryTests(ITestOutputHelper output) {
            var connectionFile = Environment.GetEnvironmentVariable("productmanager_systemdb_dev");
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    { "Connections:SystemConnection", connectionFile }
                })
                .Build();

            var factory = new DbConnectionFactory(config);
            _repository = new ProductRepository(factory);

            _output = output;
        }

        [Fact]
        public async Task Test_AppendJobTableRow() {
            var name = "101DK0040349E";
            var state = ProductState.InTransit;
            

            // Adds or updates row
            await _repository.AppendAsync(name, state);


            // Fetch row
            var result = await _repository.GetCurrentByNameAsync(name);


            // Compare the results
            Assert.NotNull(result);
            Assert.Equal(state, result!.State);



            System.Diagnostics.Debugger.Break();
        }
    }
}
