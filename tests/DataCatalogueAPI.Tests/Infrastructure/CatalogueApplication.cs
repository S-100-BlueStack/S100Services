using System.Net;
using ICSharpCode.SharpZipLib.Zip;
using System.Net.Http.Json;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Controllers;
using DataCatalague.Api.Initialization;
using DataCatalague.Api.Repositories;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace DataCatalogue.Api.Tests.Infrastructure;

public sealed class CatalogueApplication : IAsyncDisposable
{
    private readonly WebApplication _host;
    public string DirectoryPath { get; }
    public HttpClient Client { get; }
    public IServiceProvider Services => this._host.Services;

    private CatalogueApplication(WebApplication host, string directory) {
        this._host = host;
        this.DirectoryPath = directory;
        this.Client = host.GetTestClient();
        this.Client.DefaultRequestHeaders.Add(TestAuthentication.UserHeader, "PROD\\alice");
    }

    public static async Task<CatalogueApplication> CreateAsync(CatalogueFixture runtime) {
        var directory = Path.Combine(Path.GetTempPath(), "DataCatalogueTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        WebApplication? host = null;
        try {
            // Mirror Program.cs inside this test's private directory; disposal removes it.
            foreach (var file in Directory.GetFiles(directory, "*s100ed17*.geodatabase*")) {
                File.Delete(Path.GetFullPath(file));
            }
            FastZip fastZip = new();
            fastZip.ExtractZip(Path.Combine(AppContext.BaseDirectory, "s100ed17.zip"), directory, null);
            var database = Path.Combine(directory, "s100ed17.geodatabase");
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ApplicationName = typeof(DispatcherController).Assembly.FullName, ContentRootPath = directory, EnvironmentName = "Testing" });
            builder.Logging.ClearProviders();
            builder.WebHost.UseTestServer();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
                ["Dispatcher:Geodatabase"] = database,
                ["Packages:Geodatabase"] = database,
                ["Packages:Archive"] = directory,
            });
            builder.Services.AddSingleton(runtime.Dispatcher);
            builder.Services.AddDispatcherConfiguration(builder.Configuration).AddPackageConfiguration(builder.Configuration);
            builder.Services.AddCatalogueRuntimeServices();
            builder.Services.AddApplicationServices();
            builder.Services.AddApiVersioningSupport();
            builder.Services.AddVersionedOpenApiDocuments();
            builder.Services.AddAuthentication(TestAuthentication.SchemeName).AddScheme<AuthenticationSchemeOptions, TestAuthentication>(TestAuthentication.SchemeName, _ => { });
            builder.Services.AddAuthorization(options => {
                options.AddPolicy("datacatalogue:access", policy => policy.RequireAuthenticatedUser().RequireClaim("catalogue-test-access", "allowed"));
                options.DefaultPolicy = options.GetPolicy("datacatalogue:access")!;
                options.FallbackPolicy = options.DefaultPolicy;
            });
            host = builder.Build();
            host.UseExceptionHandler();
            host.UseRouting();
            host.UseAuthentication();
            host.UseAuthorization();
            host.MapControllers();
            host.MapOpenApi();
            await host.StartAsync();
            return new CatalogueApplication(host, directory);
        }
        catch {
            if (host is not null) { await host.DisposeAsync(); }
            Directory.Delete(directory, recursive: true);
            throw;
        }
    }

    public async Task SeedAsync() {
        using var scope = this.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SampleDataInitialization>().InitializeAsync(default);
    }

    public async Task EventuallyAsync(Func<Task<bool>> condition) {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (!await condition()) { await Task.Delay(25, timeout.Token); }
    }

    public async Task<T> CreateAsync<T>(string path, object request) {
        using var response = await this.Client.PostAsJsonAsync(path, request);
        Assert.True(response.StatusCode == HttpStatusCode.Created, $"POST {path} returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        Assert.NotNull(response.Headers.Location);
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    public async ValueTask DisposeAsync() {
        this.Client.Dispose();
        await this._host.StopAsync();
        await this._host.DisposeAsync();
        Directory.Delete(this.DirectoryPath, recursive: true);
    }
}
