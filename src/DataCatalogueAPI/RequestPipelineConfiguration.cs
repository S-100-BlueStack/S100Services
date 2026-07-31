using Asp.Versioning;
using Asp.Versioning.ApiExplorer;
using Scalar.AspNetCore;
using Serilog;

namespace DataCatalague.Api.Configuration;

/// <summary>
/// Builds the HTTP request pipeline, including both documentation user interfaces.
/// </summary>
public static class RequestPipelineConfiguration
{
    /// <summary>
    /// Configuration key controlling whether the Swagger UI and Scalar interfaces are served.
    /// </summary>
    public const string EnableUiConfigurationKey = "OpenApi:EnableUi";

    /// <summary>
    /// Configures middleware and endpoints in the order the application requires.
    /// </summary>
    /// <param name="app">The web application to configure.</param>
    /// <returns>The same <paramref name="app"/> instance, to allow chaining.</returns>
    /// <exception cref="ArgumentNullException">
    /// Thrown when <paramref name="app"/> is <see langword="null"/>.
    /// </exception>
    public static WebApplication ConfigureRequestPipeline(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        if (app.Environment.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
        }
        else
        {
            // Converts unhandled exceptions into ProblemDetails responses.
            app.UseExceptionHandler();
            app.UseHsts();
        }

        app.UseStatusCodePages();

        app.UseSerilogRequestLogging(options =>
        {
            options.MessageTemplate =
                "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000} ms";

            options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
            {
                diagnosticContext.Set("RequestHost", httpContext.Request.Host.Value);
                diagnosticContext.Set("RequestScheme", httpContext.Request.Scheme);
                diagnosticContext.Set("ClientIp", httpContext.Connection.RemoteIpAddress?.ToString());

                // Extension property introduced in Asp.Versioning 10; on 8.x this was
                // the extension method httpContext.GetRequestedApiVersion().
                var apiVersion = httpContext.RequestedApiVersion;

                if (apiVersion is not null)
                {
                    diagnosticContext.Set("ApiVersion", apiVersion.ToString());
                }
            };
        });

        app.UseHttpsRedirection();

        // Serves /openapi/v1.json and /openapi/v2.json.
        // Swap in "/openapi/{documentName}.yaml" if you prefer YAML, or map both.
        app.MapOpenApi();

        app.MapControllers();
        app.MapHealthChecks("/health");

        if (app.Configuration.GetValue<bool>(EnableUiConfigurationKey))
        {
            app.UseApiDocumentationUi();
        }

        return app;
    }

    private static void UseApiDocumentationUi(this WebApplication app)
    {
        var versionProvider = app.Services.GetRequiredService<IApiVersionDescriptionProvider>();

        // Newest version first, so the UI opens on the version most clients should use.
        var descriptions = versionProvider.ApiVersionDescriptions
            .OrderByDescending(description => description.ApiVersion)
            .ToList();

        // Swagger UI at /swagger. Only the UI package is referenced; document generation
        // is handled by Microsoft.AspNetCore.OpenApi.
        app.UseSwaggerUI(options =>
        {
            options.DocumentTitle = "OpenApiDemo API";
            options.RoutePrefix = "swagger";
            options.DisplayRequestDuration();

            foreach (var description in descriptions)
            {
                options.SwaggerEndpoint(
                    $"/openapi/{description.GroupName}.json",
                    BuildDisplayName(description));
            }
        });

        // Scalar at /scalar, with a per-version document picker.
        app.MapScalarApiReference(options =>
        {
            options.WithTitle("OpenApiDemo API");
            options.WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);

            for (var index = 0; index < descriptions.Count; index++)
            {
                var description = descriptions[index];

                options.AddDocument(
                    description.GroupName,
                    BuildDisplayName(description),
                    isDefault: index == 0);
            }
        });
    }

    private static string BuildDisplayName(ApiVersionDescription description)
    {
        var name = description.GroupName.ToUpperInvariant();

        return description.IsDeprecated ? $"{name} (deprecated)" : name;
    }
}
