using System.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI;
using ProductCatalogueAPI.Services.Export;

namespace TestProductCatalogueAPI
{
    [Collection(ProcessConfigurationCollection.Name)]
    public sealed class S100CompilerConfigurationTests : IDisposable
    {
        private const string EnvironmentVariableName = "S100Compiler__ExecutablePath";
        private readonly string? _originalEnvironmentValue;
        private readonly string _temporaryRoot = Path.Combine(
            Path.GetTempPath(),
            $"product-catalogue-compiler-{Guid.NewGuid():N}"
        );

        public S100CompilerConfigurationTests() {
            _originalEnvironmentValue = Environment.GetEnvironmentVariable(EnvironmentVariableName);
            Environment.SetEnvironmentVariable(EnvironmentVariableName, null);
            Directory.CreateDirectory(_temporaryRoot);
        }

        [Fact]
        public void S100CompilerConfiguration_UsesConfiguredExecutablePath() {
            var configuration = new Microsoft.Extensions.Configuration.ConfigurationManager();
            configuration[S100CompilerConfiguration.ExecutablePathKey] = @"D:\Tools\s100compiler.exe";

            var path = S100CompilerConfiguration.ResolveExecutablePath(configuration);

            Assert.Equal(@"D:\Tools\s100compiler.exe", path);
        }

        [Fact]
        public void S100CompilerConfiguration_UsesCompatibilityDefault() {
            var configuration = new Microsoft.Extensions.Configuration.ConfigurationManager();

            var path = S100CompilerConfiguration.ResolveExecutablePath(configuration);

            Assert.Equal(S100CompilerConfiguration.CompatibilityDefaultExecutablePath, path);
            Assert.Equal(@"C:\Program Files\s100compiler\s100compiler.exe", path);
        }

        [Fact]
        public void S100CompilerConfiguration_InvalidExecutableFailsExportPrerequisite() {
            var invalidPath = Path.Combine(_temporaryRoot, "missing", "s100compiler.exe");
            var service = CreateExportService(invalidPath);

            var exception = Assert.Throws<S100CompilerPrerequisiteException>(
                service.EnsureS100CompilerAvailable
            );

            Assert.Equal(S100CompilerContract.UnavailableCode, exception.Code);
            Assert.Equal(S100CompilerContract.UnavailableMessage, exception.Message);
            Assert.DoesNotContain(invalidPath, exception.Message, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void S100CompilerConfiguration_BlankConfiguredExecutableFailsExportPrerequisite() {
            var service = CreateExportService("   ");

            var exception = Assert.Throws<S100CompilerPrerequisiteException>(
                service.EnsureS100CompilerAvailable
            );

            Assert.Equal(S100CompilerContract.UnavailableCode, exception.Code);
            Assert.Equal(S100CompilerContract.UnavailableMessage, exception.Message);
            Assert.Equal(0, service.ProcessStartCalls);
        }

        [Fact]
        public void S100CompilerConfiguration_NonExecutableFileFailsBeforeProcessStart() {
            var invalidPath = Path.Combine(_temporaryRoot, "s100compiler.txt");
            File.WriteAllText(invalidPath, "not an executable");
            var service = CreateExportService(invalidPath);

            Assert.Throws<S100CompilerPrerequisiteException>(
                service.EnsureS100CompilerAvailable
            );

            Assert.Equal(0, service.ProcessStartCalls);
        }

        [Fact]
        public void S100CompilerConfiguration_EnvironmentOverrideWins() {
            File.WriteAllText(
                Path.Combine(_temporaryRoot, "appsettings.json"),
                "{\"S100Compiler\":{\"ExecutablePath\":\"C:\\\\base\\\\s100compiler.exe\"}}"
            );
            const string environmentPath = @"D:\Configured\s100compiler.exe";
            Environment.SetEnvironmentVariable(EnvironmentVariableName, environmentPath);

            var builder = Program.CreateApplicationBuilder(Array.Empty<string>(), _temporaryRoot);
            var path = S100CompilerConfiguration.ResolveExecutablePath(builder.Configuration);

            Assert.Equal(environmentPath, path);
        }

        [Fact]
        public void InvalidCompilerPathDoesNotStartProcessOrCreateExportOutput() {
            var invalidPath = Path.Combine(_temporaryRoot, "missing", "s100compiler.exe");
            var outputPath = Path.Combine(_temporaryRoot, "output");
            var service = CreateExportService(invalidPath);

            Assert.Throws<S100CompilerPrerequisiteException>(() =>
                service.CreateS100Export("101DK001", 1, 0, outputPath, "dataset-yaml")
            );

            Assert.Equal(0, service.ProcessStartCalls);
            Assert.False(Directory.Exists(outputPath));
        }

        public void Dispose() {
            Environment.SetEnvironmentVariable(EnvironmentVariableName, _originalEnvironmentValue);
            Directory.Delete(_temporaryRoot, recursive: true);
        }

        private RecordingExportService CreateExportService(string executablePath) => new(
            NullLogger<ExportService>.Instance,
            _temporaryRoot,
            executablePath
        );

        private sealed class RecordingExportService(
            Microsoft.Extensions.Logging.ILogger<ExportService> logger,
            string artifactsPath,
            string executablePath
        ) : ExportService(logger, artifactsPath, executablePath)
        {
            public int ProcessStartCalls { get; private set; }

            protected override Process StartCompilerProcess(ProcessStartInfo startInfo) {
                ProcessStartCalls++;
                throw new InvalidOperationException("The test must not start a process.");
            }
        }
    }
}
