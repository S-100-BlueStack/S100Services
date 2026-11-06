using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using ProductCatalogueAPI.Services.Export;

namespace TestProductCatalogueAPI;

/// <summary>Verifies configuration and launch diagnostics without starting Java or installed compiler processes.</summary>
public sealed class ExportToolDiagnosticsTests
{
    /// <summary>Mapper and S-57 compiler paths use configured values while keeping compatibility defaults when absent.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void PipelinePathsAreReadFromConfiguration(bool mapper) {
        var configuration = new ConfigurationManager();
        var key = mapper ? ExportToolConfiguration.MapperExecutablePathKey : ExportToolConfiguration.S57ExecutablePathKey;
        string Resolve() => mapper ? ExportToolConfiguration.ResolveMapperExecutablePath(configuration) : ExportToolConfiguration.ResolveS57ExecutablePath(configuration);
        Assert.Equal(mapper ? ExportToolConfiguration.DefaultMapperExecutablePath : ExportToolConfiguration.DefaultS57ExecutablePath, Resolve());
        configuration[key] = @"D:\ExportTools\custom.exe";
        Assert.Equal(@"D:\ExportTools\custom.exe", Resolve());
        configuration[key] = string.Empty;
        Assert.Equal(string.Empty, Resolve());
    }

    /// <summary>Every tool reports its actual path and UTC file modification time without executing it.</summary>
    [Theory]
    [InlineData("s100compiler.exe")]
    [InlineData("s100mapper.exe")]
    [InlineData("s57compiler.exe")]
    public void LaunchDiagnosticsIdentifyTheExecutableAndModifiedTime(string fileName) {
        var directory = Path.Combine(Path.GetTempPath(), "export-tools-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try {
            var path = Path.Combine(directory, fileName);
            File.WriteAllText(path, "diagnostic fixture, never executed");
            File.SetLastWriteTimeUtc(path, new DateTime(2026, 10, 30, 12, 0, 0, DateTimeKind.Utc));
            var expectedModified = File.GetLastWriteTimeUtc(path);
            var logger = new RecordingLogger();

            ExportToolDiagnostics.LogBeforeLaunch(logger, path, "101DK001");

            var entry = Assert.Single(logger.Entries.Where(entry => entry.Level == LogLevel.Information));
            Assert.Equal(fileName, entry.Properties["CompilerName"]);
            Assert.Equal(Path.GetFullPath(path), entry.Properties["ExecutablePath"]);
            Assert.Equal(expectedModified, entry.Properties["LastModifiedUtc"]);
            Assert.Equal("101DK001", entry.Properties["DatasetName"]);
        }
        finally { Directory.Delete(directory, recursive: true); }
    }

    /// <summary>Missing inherited options are diagnostic warnings and cannot block export.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void MissingJavaOptionsProduceAWarning(string? value) {
        var logger = new RecordingLogger();
        ExportToolDiagnostics.WarnIfJavaOptionsMissing(logger, value, "101DK001");
        Assert.Equal(LogLevel.Warning, Assert.Single(logger.Entries).Level);
    }

    /// <summary>The Java option value is never included in diagnostic output.</summary>
    [Fact]
    public void ConfiguredJavaOptionsAreNotLogged() {
        var logger = new RecordingLogger();
        ExportToolDiagnostics.WarnIfJavaOptionsMissing(logger, "-Dprivate.setting=sensitive", "101DK001");
        Assert.Empty(logger.Entries);
    }

    /// <summary>Captures structured diagnostic properties without configuring the application's global logger.</summary>
    private sealed class RecordingLogger : ILogger
    {
        internal List<(LogLevel Level, IReadOnlyDictionary<string, object?> Properties)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, ((IEnumerable<KeyValuePair<string, object?>>)(object)state!).ToDictionary(pair => pair.Key, pair => pair.Value)));
    }
}
