using Microsoft.AspNetCore.HttpsPolicy;

namespace DataCatalague.Api.Configuration;

/// <summary>
/// Configures transport security: HTTPS redirection and HTTP Strict Transport Security.
/// </summary>
public static class TransportSecurityConfiguration
{
    /// <summary>
    /// Registers HTTPS redirection and HSTS options.
    /// </summary>
    /// <param name="services">The service collection to add the options to.</param>
    /// <returns>The same <paramref name="services"/> instance, to allow chaining.</returns>
    /// <exception cref="ArgumentNullException">
    /// Thrown when <paramref name="services"/> is <see langword="null"/>.
    /// </exception>
    public static IServiceCollection AddSecureTransport(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddHttpsRedirection(options =>
        {
            // 308 preserves the HTTP method and body on redirect, which matters for
            // POST/PUT clients that would otherwise silently degrade to GET.
            options.RedirectStatusCode = StatusCodes.Status308PermanentRedirect;

            // The HTTPS port is discovered from the ASPNETCORE_HTTPS_PORT environment
            // variable or the configured Kestrel endpoints. Set it explicitly here when
            // the API runs behind a proxy that terminates TLS on a non-standard port.
            // options.HttpsPort = 443;
        });

        services.AddHsts(options =>
        {
            options.Preload = true;
            options.IncludeSubDomains = true;
            options.MaxAge = TimeSpan.FromDays(365);
        });

        return services;
    }
}
