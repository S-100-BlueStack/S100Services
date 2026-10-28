using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ProductCatalogueAPI;
using ProductCatalogueAPI.Startup;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI
{
    public sealed class ProductCatalogueStartupPrerequisiteTests
    {
        [Fact]
        public async Task ProductCatalogueStartup_RejectsMissingS128Connection() {
            var exception = await Assert.ThrowsAsync<ProductCatalogueStartupException>(() =>
                new ServiceCollection().AddS100ProductCatalogue(new ConfigurationManager())
            );

            Assert.Equal(ProductCatalogueStartupFailureCategory.S128Configuration, exception.Category);
            Assert.Equal("S128_CONFIGURATION_INVALID", exception.Code);
        }

        [Fact]
        public async Task ProductCatalogueStartup_RejectsMissingS128ConnectionPath() {
            var path = Path.Combine(Path.GetTempPath(), $"missing-{Guid.NewGuid():N}.sde");
            var configuration = ConfigurationWithS128Connection(path);

            var exception = await Assert.ThrowsAsync<ProductCatalogueStartupException>(() =>
                new ServiceCollection().AddS100ProductCatalogue(configuration)
            );

            Assert.Equal(ProductCatalogueStartupFailureCategory.S128Configuration, exception.Category);
            Assert.Equal("S128_CONFIGURATION_INVALID", exception.Code);
        }

        [Fact]
        public async Task ProductCatalogueStartup_RejectsUnsupportedS128ConnectionType() {
            var path = Path.Combine(Path.GetTempPath(), $"unsupported-{Guid.NewGuid():N}.json");
            await File.WriteAllTextAsync(path, "{}");
            try {
                var configuration = ConfigurationWithS128Connection(path);

                var exception = await Assert.ThrowsAsync<ProductCatalogueStartupException>(() =>
                    new ServiceCollection().AddS100ProductCatalogue(configuration)
                );

                Assert.Equal(ProductCatalogueStartupFailureCategory.S128Configuration, exception.Category);
                Assert.Equal("S128_CONFIGURATION_INVALID", exception.Code);
            }
            finally {
                File.Delete(path);
            }
        }

        [Fact]
        public async Task ProductCatalogueStartupFailure_DoesNotContinueWithoutProductManager() {
            var services = new ServiceCollection();
            var configuration = ConfigurationWithS128Connection(
                Path.Combine(Path.GetTempPath(), $"missing-{Guid.NewGuid():N}.gdb")
            );

            await Assert.ThrowsAsync<ProductCatalogueStartupException>(() =>
                services.AddS100ProductCatalogue(configuration)
            );

            Assert.DoesNotContain(
                services,
                descriptor => descriptor.ServiceType == typeof(IProductManager)
            );
        }

        [Fact]
        public async Task ProductCatalogueStartupFailure_DoesNotExposeConfiguredPathInSafeMessage() {
            const string sensitiveMarker = "sensitive-connection-name";
            var path = Path.Combine(
                Path.GetTempPath(),
                sensitiveMarker,
                $"missing-{Guid.NewGuid():N}.sde"
            );
            var configuration = ConfigurationWithS128Connection(path);

            var exception = await Assert.ThrowsAsync<ProductCatalogueStartupException>(() =>
                new ServiceCollection().AddS100ProductCatalogue(configuration)
            );

            Assert.Equal(
                "S128_CONFIGURATION_INVALID: Required S-128 configuration is invalid.",
                exception.Message
            );
            Assert.DoesNotContain(sensitiveMarker, exception.Message, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(path, exception.Message, StringComparison.OrdinalIgnoreCase);
        }

        private static ConfigurationManager ConfigurationWithS128Connection(string path) {
            var configuration = new ConfigurationManager();
            configuration["Connections:S128Connection"] = path;
            return configuration;
        }
    }
}
