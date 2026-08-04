using Serilog;

namespace DataCatalague.Api.Configuration;

/// <summary>
/// Registers Serilog as the logging provider for the application.
/// </summary>
public static class SerilogConfiguration
{
    /// <summary>
    /// Replaces the default logging providers with Serilog, reading the sink and
    /// minimum level configuration from the <c>Serilog</c> configuration section.
    /// </summary>
    /// <param name="builder">The web application builder to configure.</param>
    /// <returns>The same <paramref name="builder"/> instance, to allow chaining.</returns>
    /// <exception cref="ArgumentNullException">
    /// Thrown when <paramref name="builder"/> is <see langword="null"/>.
    /// </exception>
    public static WebApplicationBuilder AddSerilogLogging(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddSerilog((services, loggerConfiguration) => loggerConfiguration
            .ReadFrom.Configuration(builder.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext()
            .Enrich.WithProperty("Application", builder.Environment.ApplicationName)
            .Enrich.WithProperty("Environment", builder.Environment.EnvironmentName));

        return builder;
    }
}
