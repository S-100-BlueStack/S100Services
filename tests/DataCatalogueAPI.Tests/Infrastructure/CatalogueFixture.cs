using DataCatalague.Api.Repositories;

namespace DataCatalogue.Api.Tests.Infrastructure;

[CollectionDefinition(CatalogueCollection.Name, DisableParallelization = true)]
public sealed class CatalogueCollection : ICollectionFixture<CatalogueFixture>
{
    public const string Name = "Catalogue native runtime";
}

public sealed class CatalogueFixture : IAsyncLifetime
{
    public ArcGisDispatcher Dispatcher { get; private set; } = null!;

    public async Task InitializeAsync() {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitProcess) { throw new PlatformNotSupportedException("Catalogue integration tests require a Windows x64 process."); }
        var bin = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "ArcGIS", "Pro", "bin");
        if (!File.Exists(Path.Combine(bin, "ArcGIS.CoreHost.dll"))) { throw new InvalidOperationException("Install and license ArcGIS Pro before running catalogue integration tests."); }
        if (!File.Exists(Path.Combine(AppContext.BaseDirectory, "s100ed17.zip"))) { throw new FileNotFoundException("The API's s100ed17.zip template must be available in the test output. It is not included in filtered context exports."); }
        Environment.SetEnvironmentVariable("PATH", bin + Path.PathSeparator + Environment.GetEnvironmentVariable("PATH"));
        // CoreHost is initialized once per test process; each application has its own database and event store.
        this.Dispatcher = new ArcGisDispatcher();
        await this.Dispatcher.ExecuteAsync(() => true).WaitAsync(TimeSpan.FromSeconds(60));
    }

    public Task DisposeAsync() {
        this.Dispatcher?.Dispose();
        return Task.CompletedTask;
    }
}
