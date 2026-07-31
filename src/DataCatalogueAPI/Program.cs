using DataCatalague.Api.Configuration;
using Serilog;

namespace DataCatalague.Api;

/// <summary>
/// Hosts the application entry point.
/// </summary>
public static class Program
{
    /// <summary>
    /// Builds, configures and runs the web application.
    /// </summary>
    /// <param name="args">The command line arguments passed to the process.</param>
    /// <returns>Zero when the host shut down normally, otherwise one.</returns>
    public static async Task<int> Main(string[] args)
    {
        // A bootstrap logger captures failures that happen before the host (and the
        // fully configured Serilog pipeline) is available.
        Log.Logger = new LoggerConfiguration()
            .WriteTo.Console()
            .CreateBootstrapLogger();

        try
        {
            var builder = WebApplication.CreateBuilder(args);

            builder.AddSerilogLogging();
            builder.Services.AddApplicationServices();
            builder.Services.AddApiVersioningSupport();
            builder.Services.AddVersionedOpenApiDocuments();
            builder.Services.AddSecureTransport();

            var app = builder.Build();

            app.ConfigureRequestPipeline();

            await app.RunAsync().ConfigureAwait(false);
            return 0;
        }
        catch (Exception exception) when (exception is not HostAbortedException)
        {
            Log.Fatal(exception, "The application terminated unexpectedly.");
            return 1;
        }
        finally
        {
            await Log.CloseAndFlushAsync().ConfigureAwait(false);
        }
    }
}
