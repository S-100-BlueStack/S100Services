using DataCatalague.Api.Repositories;
using Eventuous;
using System.Text.Json.Serialization;

namespace DataCatalague.Api.Configuration;

/// <summary>
/// Registers the application's own services and the MVC infrastructure.
/// </summary>
public static class ApplicationServicesConfiguration
{
    /// <summary>
    /// Adds controllers, RFC 9457 problem details, health checks and the domain services.
    /// </summary>
    /// <param name="services">The service collection to add the services to.</param>
    /// <returns>The same <paramref name="services"/> instance, to allow chaining.</returns>
    /// <exception cref="ArgumentNullException">
    /// Thrown when <paramref name="services"/> is <see langword="null"/>.
    /// </exception>
    public static IServiceCollection AddApplicationServices(this IServiceCollection services) {
        ArgumentNullException.ThrowIfNull(services);

        services
            .AddControllers()
            .AddControllersAsServices()
            .AddJsonOptions(options => {
                options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            });

        // Produces consistent ProblemDetails payloads for error responses, including the
        // 400 responses that API versioning itself generates for unsupported versions.
        services.AddProblemDetails();

        services.AddHealthChecks();
        services.AddTransient<DataCatalague.Api.Services.PackageGeometryService>();
        services.AddSingleton<DataCatalague.Api.Services.PackageIdentityService>();
        services.AddTransient<DataCatalague.Api.Services.WorkspaceService>();
        services.AddSingleton<PipelineAssignmentIndex>();
        services.AddTransient<DataCatalague.Api.Services.PipelineAssignmentService>();
        services.AddTransient<DataCatalague.Api.Services.WorkspaceQueryService>();

        //services.AddSingleton<IDataRepository, InMemoryProductRepository>();
        // The shared in-memory event store is registered in Program.cs.

        //services.AddSingleton<IProductRepository, InMemoryProductRepository>();

        return services;
    }
}
