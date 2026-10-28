using System.Text.Json;
using ProductCatalogueAPI;

namespace TestProductCatalogueAPI
{
    [CollectionDefinition(ProcessConfigurationCollection.Name, DisableParallelization = true)]
    public sealed class ProcessConfigurationCollection
    {
        public const string Name = "Process configuration";
    }

    [Collection(ProcessConfigurationCollection.Name)]
    public sealed class ConfigurationPrecedenceTests : IDisposable
    {
        private const string ConfigurationKey = "Fi018C1Precedence:Value";
        private const string EnvironmentVariableName = "Fi018C1Precedence__Value";
        private const string EnvironmentName = "Fi018C1Test";

        private readonly string _temporaryRoot = Path.Combine(
            Path.GetTempPath(),
            $"product-catalogue-config-{Guid.NewGuid():N}"
        );
        private readonly string? _originalEnvironmentValue;

        public ConfigurationPrecedenceTests() {
            _originalEnvironmentValue = Environment.GetEnvironmentVariable(EnvironmentVariableName);
            Environment.SetEnvironmentVariable(EnvironmentVariableName, null);
            Directory.CreateDirectory(_temporaryRoot);
        }

        [Fact]
        public void ConfigurationPrecedence_UsesBaseJsonWhenNoHigherPrioritySourceExists() {
            WriteSettings("appsettings.json", "base-json");

            var builder = CreateBuilder();

            Assert.Equal("base-json", builder.Configuration[ConfigurationKey]);
        }

        [Fact]
        public void ConfigurationPrecedence_EnvironmentJsonOverridesBaseJson() {
            WriteSettings("appsettings.json", "base-json");
            WriteSettings($"appsettings.{EnvironmentName}.json", "environment-json");

            var builder = CreateBuilder();

            Assert.Equal("environment-json", builder.Configuration[ConfigurationKey]);
        }

        [Fact]
        public void ConfigurationPrecedence_EnvironmentVariableOverridesJson() {
            WriteSettings("appsettings.json", "base-json");
            WriteSettings($"appsettings.{EnvironmentName}.json", "environment-json");
            Environment.SetEnvironmentVariable(EnvironmentVariableName, "environment-variable");

            var builder = CreateBuilder();

            Assert.Equal("environment-variable", builder.Configuration[ConfigurationKey]);
        }

        [Fact]
        public void ConfigurationPrecedence_CommandLineOverridesEnvironmentVariable() {
            WriteSettings("appsettings.json", "base-json");
            WriteSettings($"appsettings.{EnvironmentName}.json", "environment-json");
            Environment.SetEnvironmentVariable(EnvironmentVariableName, "environment-variable");

            var builder = CreateBuilder($"--{ConfigurationKey}=command-line");

            Assert.Equal("command-line", builder.Configuration[ConfigurationKey]);
        }

        public void Dispose() {
            Environment.SetEnvironmentVariable(EnvironmentVariableName, _originalEnvironmentValue);
            Directory.Delete(_temporaryRoot, recursive: true);
        }

        private void WriteSettings(string fileName, string value) {
            var json = JsonSerializer.Serialize(new Dictionary<string, object?> {
                ["Fi018C1Precedence"] = new Dictionary<string, string> {
                    ["Value"] = value
                }
            });
            File.WriteAllText(Path.Combine(_temporaryRoot, fileName), json);
        }

        private Microsoft.AspNetCore.Builder.WebApplicationBuilder CreateBuilder(params string[] applicationArgs) {
            var args = new[] { $"--environment={EnvironmentName}" }
                .Concat(applicationArgs)
                .ToArray();
            return Program.CreateApplicationBuilder(args, _temporaryRoot);
        }
    }
}
