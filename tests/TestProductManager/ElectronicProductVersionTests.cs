using ArcGIS.Core.Data;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using System.Reflection;

namespace TestProductCatalogueAPI
{
    public class ElectronicProductVersionTests
    {
        [Fact]
        public void ExactLookupDoesNotConfuseOverlappingDatasetNames() {
            var result = Select(
                "101DK001",
                [
                    Product("101DK001", 4, 2),
                    Product("101DK001A", 9, 1)
                ]
            );

            Assert.NotNull(result);
            Assert.Equal("101DK001", result!.DatasetName);
            Assert.Equal(4, result.Edition);
            Assert.Equal(2, result.Update);
        }

        [Fact]
        public void ExactLookupIsCaseInsensitiveAndTrimsWhitespace() {
            var result = Select(
                " 101dk001 ",
                [Product("101DK001", 7, 3)]
            );

            Assert.NotNull(result);
            Assert.Equal(7, result!.Edition);
            Assert.Equal(3, result.Update);
        }

        [Fact]
        public void ExactLookupPreservesNullableVersionValues() {
            var result = Select(
                "101DK001",
                [Product("101DK001", null, null)]
            );

            Assert.NotNull(result);
            Assert.Null(result!.Edition);
            Assert.Null(result.Update);
        }

        [Fact]
        public void ZeroExactMatchesReturnsNull() {
            var result = Select(
                "101DK001",
                [Product("101DK001A", 2, 0)]
            );

            Assert.Null(result);
        }

        [Fact]
        public void MultipleExactMatchesThrowDataIntegrityException() {
            var exception = Assert.Throws<TargetInvocationException>(() => Select(
                "101DK001",
                [
                    Product("101DK001", 2, 0),
                    Product("101dk001", 3, 0)
                ]
            ));

            var integrityException = Assert.IsType<ProductDataIntegrityException>(
                exception.InnerException
            );
            Assert.Equal("101DK001", integrityException.DatasetName);
            Assert.Equal(2, integrityException.ExactMatchCount);
        }

        [Fact]
        public void VersionQueryOnlyRequestsS128ElectronicProductAttributes() {
            var method = typeof(ProductManagerGDB).GetMethod(
                "CreateElectronicProductVersionQueryFilter",
                BindingFlags.NonPublic | BindingFlags.Static
            ) ?? throw new InvalidOperationException("Version query factory was not found.");

            var filter = Assert.IsType<QueryFilter>(method.Invoke(null, null));
            Assert.Equal(
                "upper(ps) = 'S-128' AND code = 'ElectronicProduct'",
                filter.WhereClause
            );
            Assert.Equal("attributebindings", filter.SubFields);
            Assert.False(filter.SubFields.Contains("shape", StringComparison.OrdinalIgnoreCase));
        }

        private static ElectronicProductVersion? Select(
            string requestedDatasetName,
            IEnumerable<ElectronicProduct> candidates
        ) {
            var method = typeof(ProductManagerGDB).GetMethod(
                "SelectExactElectronicProductVersion",
                BindingFlags.NonPublic | BindingFlags.Static
            ) ?? throw new InvalidOperationException("Version selector was not found.");

            return (ElectronicProductVersion?)method.Invoke(
                null,
                [requestedDatasetName, candidates]
            );
        }

        private static ElectronicProduct Product(
            string datasetName,
            int? edition,
            int? update
        ) => new() {
            datasetName = datasetName,
            editionNumber = edition,
            updateNumber = update
        };
    }
}
