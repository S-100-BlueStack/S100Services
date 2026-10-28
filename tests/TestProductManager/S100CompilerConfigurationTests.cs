using System.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI;
using ProductCatalogueAPI.Data.Models;
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
            var engine = CreateExportEngine(invalidPath);

            var exception = Assert.Throws<S100CompilerPrerequisiteException>(
                engine.EnsureS100CompilerAvailable
            );

            Assert.Equal(S100CompilerContract.UnavailableCode, exception.Code);
            Assert.Equal(S100CompilerContract.UnavailableMessage, exception.Message);
            Assert.DoesNotContain(invalidPath, exception.Message, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void S100CompilerConfiguration_BlankConfiguredExecutableFailsExportPrerequisite() {
            var engine = CreateExportEngine("   ");

            var exception = Assert.Throws<S100CompilerPrerequisiteException>(
                engine.EnsureS100CompilerAvailable
            );

            Assert.Equal(S100CompilerContract.UnavailableCode, exception.Code);
            Assert.Equal(S100CompilerContract.UnavailableMessage, exception.Message);
            Assert.Equal(0, engine.ProcessStartCalls);
        }

        [Fact]
        public void S100CompilerConfiguration_NonExecutableFileFailsBeforeProcessStart() {
            var invalidPath = Path.Combine(_temporaryRoot, "s100compiler.txt");
            File.WriteAllText(invalidPath, "not an executable");
            var engine = CreateExportEngine(invalidPath);

            Assert.Throws<S100CompilerPrerequisiteException>(
                engine.EnsureS100CompilerAvailable
            );

            Assert.Equal(0, engine.ProcessStartCalls);
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
        public async Task InvalidCompilerPathDoesNotStartProcessOrCreateExportOutput() {
            var invalidPath = Path.Combine(_temporaryRoot, "missing", "s100compiler.exe");
            var outputPath = Path.Combine(_temporaryRoot, "output");
            var engine = CreateExportEngine(invalidPath);

            await Assert.ThrowsAsync<S100CompilerPrerequisiteException>(() =>
                engine.ExportAsync(new ExportEngineRequest("101DK001", ProductSpecification.S101, 1, 0, outputPath, "dataset-yaml"))
            );

            Assert.Equal(0, engine.ProcessStartCalls);
            Assert.False(Directory.Exists(outputPath));
        }

        /// <summary>Guards against deleting an earlier candidate before a missing compiler is detected.</summary>
        [Fact]
        public async Task InvalidCompilerPathPreservesExistingCandidateOutput() {
            var outputPath = Path.Combine(_temporaryRoot, "output");
            var candidateDirectory = ExportOutputPath.GetCandidateDirectory(outputPath, "101DK001", ProductSpecification.S101, 1, 0);
            Directory.CreateDirectory(candidateDirectory);
            var existingFile = Path.Combine(candidateDirectory, "existing.txt");
            await File.WriteAllTextAsync(existingFile, "existing candidate");
            var engine = CreateExportEngine(Path.Combine(_temporaryRoot, "missing.exe"));

            await Assert.ThrowsAsync<S100CompilerPrerequisiteException>(() => engine.ExportAsync(new ExportEngineRequest("101DK001", ProductSpecification.S101, 1, 0, outputPath, "dataset-yaml")));

            Assert.Equal("existing candidate", await File.ReadAllTextAsync(existingFile));
            Assert.Equal(0, engine.ProcessStartCalls);
        }

        /// <summary>Checks that the migrated engine uses the override and keeps process-start errors safe.</summary>
        [Fact]
        public async Task ConfiguredCompilerIsUsedAndStartFailureDoesNotExposeTechnicalDetails() {
            var executablePath = Path.Combine(_temporaryRoot, "configured.exe");
            // The overridden process boundary prevents this fixture from ever being executed.
            await File.WriteAllTextAsync(executablePath, "compiler fixture");
            await File.WriteAllTextAsync(Path.Combine(_temporaryRoot, "101_FC_2.0.0.xml"), "catalogue fixture");
            var engine = CreateExportEngine(executablePath);
            engine.EnsureS100CompilerAvailable();
            Assert.Equal(0, engine.ProcessStartCalls);

            var exception = await Assert.ThrowsAsync<S100CompilerPrerequisiteException>(() => engine.ExportAsync(new ExportEngineRequest("101DK001", ProductSpecification.S101, 1, 0, Path.Combine(_temporaryRoot, "output"), "dataset-yaml")));

            Assert.Equal(1, engine.ProcessStartCalls);
            Assert.Equal(Path.GetFullPath(executablePath), engine.LastStartInfo!.FileName);
            Assert.Equal(S100CompilerContract.UnavailableCode, exception.Code);
            Assert.Equal(S100CompilerContract.UnavailableMessage, exception.Message);
            Assert.Null(exception.InnerException);
            Assert.DoesNotContain(executablePath, exception.Message, StringComparison.OrdinalIgnoreCase);
        }

        public void Dispose() {
            Environment.SetEnvironmentVariable(EnvironmentVariableName, _originalEnvironmentValue);
            Directory.Delete(_temporaryRoot, recursive: true);
        }

        /// <summary>Exercises the current ISO/IEC 8211 engine without invoking a real compiler.</summary>
        private RecordingExportEngine CreateExportEngine(string executablePath) => new(
            NullLogger<IsoIec8211ExportEngine>.Instance,
            _temporaryRoot,
            executablePath
        );

        private sealed class RecordingExportEngine(Microsoft.Extensions.Logging.ILogger<IsoIec8211ExportEngine> logger, string artifactsPath, string executablePath) : IsoIec8211ExportEngine(logger, artifactsPath, executablePath)
        {
            public int ProcessStartCalls { get; private set; }
            public ProcessStartInfo? LastStartInfo { get; private set; }

            /// <inheritdoc/>
            protected override Process StartCompilerProcess(ProcessStartInfo startInfo) {
                ProcessStartCalls++;
                LastStartInfo = startInfo;
                throw new InvalidOperationException("The test must not start a process.");
            }
        }
    }
}
