using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;

namespace TestProductCatalogueAPI
{
    public class ProductRepositoryBatchTests
    {
        [Fact]
        public async Task BatchCurrentReadMatchesIndividualCurrentReadSemantics() {
            const string firstName = "101DK0000001E";
            const string secondName = "101DK0000002E";
            const string unrequestedName = "101DK0000003E";
            const string missingName = "101DK0000004E";

            IProductRepository repository = new InMemoryProductRepository();

            await repository.AppendAsync(firstName, ProductState.Idle, "S-101", 1, 0, "first-owner");
            await Task.Delay(20);
            await repository.AppendAsync(firstName, ProductState.Frozen, "S-101", 2, 1, "latest-owner");
            await repository.AppendAsync(secondName, ProductState.InTransit, "S-101", 3, 2, "second-owner");
            await repository.AppendAsync(unrequestedName, ProductState.Rejected, "S-101", 4, 3, "unrequested-owner");

            var expectedFirst = await repository.GetCurrentByNameAsync(firstName);
            var expectedSecond = await repository.GetCurrentByNameAsync(secondName);

            var batch = (await repository.GetCurrentByNamesAsync([
                firstName,
                secondName,
                missingName,
                firstName
            ])).ToDictionary(product => product.Name, StringComparer.OrdinalIgnoreCase);

            Assert.Equal(2, batch.Count);
            Assert.False(batch.ContainsKey(unrequestedName));
            Assert.False(batch.ContainsKey(missingName));
            AssertEquivalent(expectedFirst, batch[firstName]);
            AssertEquivalent(expectedSecond, batch[secondName]);
        }

        [Fact]
        public async Task BatchCurrentReadReturnsEmptyForNoRequestedNames() {
            IProductRepository repository = new InMemoryProductRepository();
            await repository.AppendAsync("101DK0000001E", ProductState.Frozen, "S-101", 1, 0);

            var result = await repository.GetCurrentByNamesAsync([]);

            Assert.Empty(result);
        }

        private static void AssertEquivalent(ProductRecord? expected, ProductRecord actual) {
            Assert.NotNull(expected);
            Assert.Equal(expected!.Id, actual.Id);
            Assert.Equal(expected.Name, actual.Name);
            Assert.Equal(expected.State, actual.State);
            Assert.Equal(expected.ProductSpecification, actual.ProductSpecification);
            Assert.Equal(expected.EditionNo, actual.EditionNo);
            Assert.Equal(expected.UpdateNo, actual.UpdateNo);
            Assert.Equal(expected.Owner, actual.Owner);
            Assert.Equal(expected.Date_From, actual.Date_From);
            Assert.Equal(expected.Date_to, actual.Date_to);
        }
    }
}
