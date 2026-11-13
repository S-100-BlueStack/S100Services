using DataCatalague.Api.Mcp;
using DataCatalague.Api.Services;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ModelContextProtocol.AspNetCore;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace DataCatalague.Api.Configuration;

/// <summary>Registers and maps the explicitly allowed read-only MCP tools.</summary>
public static class McpConfiguration
{
    /// <summary>Adds a stateless Streamable HTTP server using the application's existing read services.</summary>
    public static IServiceCollection AddCatalogueMcp(this IServiceCollection services) {
        services.AddHttpContextAccessor();
        services.TryAddTransient<IDataCatalogueReadService, DataCatalogueReadService>();
        services.AddMcpServer()
            .WithHttpTransport(options => {
                // Each call uses its own authenticated HTTP request and DI scope.
                options.SessionMode = HttpServerSessionMode.Stateless;
            })
            .AddAuthorizationFilters()
            // Match MVC's camel-case fields, string enums and explicit null geometry groups.
            .WithTools<CatalogueReadTools>(new JsonSerializerOptions(JsonSerializerDefaults.Web) {
                TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
                Converters = { new JsonStringEnumConverter() },
            });
        return services;
    }

    /// <summary>Maps MCP beneath the IIS application path with the same access policy as REST reads.</summary>
    public static IEndpointConventionBuilder MapCatalogueMcp(this IEndpointRouteBuilder endpoints) => endpoints.MapMcp("/mcp").RequireAuthorization("datacatalogue:access");
}
