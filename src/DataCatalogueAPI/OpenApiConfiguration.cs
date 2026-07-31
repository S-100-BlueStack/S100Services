using OpenApiDemo.Api.OpenApi;

namespace OpenApiDemo.Api.Configuration;

/// <summary>
/// Registers one OpenAPI document per supported API version.
/// </summary>
public static class OpenApiConfiguration
{
    /// <summary>
    /// Adds an OpenAPI document for every entry in <see cref="ApiVersions.DocumentNames"/>.
    /// Each document only contains the operations whose API explorer group name matches,
    /// which is how the versions stay cleanly separated.
    /// </summary>
    /// <param name="services">The service collection to add the documents to.</param>
    /// <returns>The same <paramref name="services"/> instance, to allow chaining.</returns>
    /// <exception cref="ArgumentNullException">
    /// Thrown when <paramref name="services"/> is <see langword="null"/>.
    /// </exception>
    public static IServiceCollection AddVersionedOpenApiDocuments(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        foreach (var documentName in ApiVersions.DocumentNames)
        {
            // Captured per iteration so each options delegate closes over its own name.
            var name = documentName;

            services.AddOpenApi(name, options =>
            {
                options.ShouldInclude = description =>
                    string.Equals(description.GroupName, name, StringComparison.OrdinalIgnoreCase);

                options.AddDocumentTransformer<ApiVersionDocumentTransformer>();
            });
        }

        return services;
    }
}
