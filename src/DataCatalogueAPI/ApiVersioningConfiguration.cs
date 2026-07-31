using Asp.Versioning;

namespace DataCatalague.Api.Configuration;

/// <summary>
/// Configures API versioning for controller-based endpoints.
/// </summary>
public static class ApiVersioningConfiguration
{
    /// <summary>
    /// The request header clients may use to select an API version.
    /// </summary>
    public const string VersionHeaderName = "X-Api-Version";

    /// <summary>
    /// The query string parameter clients may use to select an API version.
    /// </summary>
    public const string VersionQueryParameterName = "api-version";

    /// <summary>
    /// Adds API versioning together with the version-aware API explorer, which is what
    /// lets the OpenAPI generator emit one document per version.
    /// </summary>
    /// <param name="services">The service collection to add the services to.</param>
    /// <returns>The same <paramref name="services"/> instance, to allow chaining.</returns>
    /// <exception cref="ArgumentNullException">
    /// Thrown when <paramref name="services"/> is <see langword="null"/>.
    /// </exception>
    public static IServiceCollection AddApiVersioningSupport(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services
            .AddApiVersioning(options =>
            {
                options.DefaultApiVersion = ApiVersions.V2;

                // Require clients to be explicit about the version they depend on.
                // Set this to true if you need unversioned clients to keep working.
                options.AssumeDefaultVersionWhenUnspecified = false;

                // Emits the api-supported-versions and api-deprecated-versions
                // response headers so clients can discover upgrades on their own.
                options.ReportApiVersions = true;

                // URL segment versioning is the primary strategy; the header and query
                // string readers are accepted as well so clients can pick what suits them.
                options.ApiVersionReader = ApiVersionReader.Combine(
                    new UrlSegmentApiVersionReader(),
                    new HeaderApiVersionReader(VersionHeaderName),
                    new QueryStringApiVersionReader(VersionQueryParameterName));
            })
            .AddMvc()
            .AddApiExplorer(options =>
            {
                // Produces group names such as "v1" and "v2", which line up with the
                // default /openapi/{documentName}.json route of Microsoft.AspNetCore.OpenApi.
                options.GroupNameFormat = "'v'VVV";

                // Replaces the {version:apiVersion} route token with the concrete version
                // so the documented URLs are directly callable.
                options.SubstituteApiVersionInUrl = true;
            });

        return services;
    }
}
