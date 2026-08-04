using Asp.Versioning.ApiExplorer;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace DataCatalague.Api.OpenApi;

/// <summary>
/// Enriches each generated OpenAPI document with metadata taken from the API version
/// it describes, including a deprecation notice for retired versions.
/// </summary>
/// <remarks>
/// Instances are activated from the dependency injection container by the OpenAPI
/// pipeline, so constructor injection works without an explicit registration.
/// </remarks>
/// <param name="descriptionProvider">Supplies the discovered API version descriptions.</param>
public sealed class ApiVersionDocumentTransformer(IApiVersionDescriptionProvider descriptionProvider)
    : IOpenApiDocumentTransformer
{
    private const string Summary =
        "Sample controller-based API demonstrating API versioning, OpenAPI document " +
        "generation, Serilog logging and HTTPS.";

    private readonly IApiVersionDescriptionProvider descriptionProvider = descriptionProvider;

    /// <inheritdoc />
    public Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(document);
        ArgumentNullException.ThrowIfNull(context);

        var description = this.descriptionProvider.ApiVersionDescriptions
            .FirstOrDefault(candidate => string.Equals(
                candidate.GroupName,
                context.DocumentName,
                StringComparison.OrdinalIgnoreCase));

        var info = document.Info;

        info.Title = "OpenApiDataCatalogue API";
        info.Version = description?.ApiVersion.ToString() ?? context.DocumentName;
        info.Description = BuildDescription(description);
        info.Contact = new OpenApiContact
        {
            Name = "Geodatastyrelsen",
            Email = "jesoe@gst.dk",
        };
        info.License = new OpenApiLicense
        {
            Name = "MIT",
            Url = new Uri("https://opensource.org/licenses/MIT"),
        };

        return Task.CompletedTask;
    }

    private static string BuildDescription(ApiVersionDescription? description)
    {
        if (description is null)
        {
            return Summary;
        }

        return description.IsDeprecated
            ? $"{Summary}\n\n**This API version is deprecated and will be removed in a future release. " +
              "Please migrate to the newest version.**"
            : Summary;
    }
}
