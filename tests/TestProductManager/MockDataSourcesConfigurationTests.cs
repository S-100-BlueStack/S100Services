using Microsoft.Extensions.Configuration;
using ProductCatalogueAPI;

namespace TestProductCatalogueAPI
{
    public sealed class MockDataSourcesConfigurationTests
    {
        [Fact]
        public void DevelopmentEnablesMockDataSourcesWithoutExplicitConfiguration() {
            var configuration = CreateConfiguration(null);

            Assert.True(MockDataSourcesConfiguration.IsEnabled(configuration, isDevelopment: true));
        }

        [Theory]
        [InlineData(null, false)]
        [InlineData("", false)]
        [InlineData("false", false)]
        [InlineData("invalid", false)]
        [InlineData("true", true)]
        [InlineData("TRUE", true)]
        public void NonDevelopmentUsesExplicitBooleanOptIn(string? configuredValue, bool expected) {
            var configuration = CreateConfiguration(configuredValue);

            Assert.Equal(expected, MockDataSourcesConfiguration.IsEnabled(configuration, isDevelopment: false));
        }

        private static IConfiguration CreateConfiguration(string? configuredValue) {
            var configuration = new ConfigurationManager();
            if (configuredValue is not null)
                configuration[MockDataSourcesConfiguration.EnabledKey] = configuredValue;

            return configuration;
        }
    }
}
