using Microsoft.OpenApi;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.Services.Export;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Reflection;
using System.Text.Json.Nodes;

namespace ProductCatalogueAPI.OpenApi
{
    /// <summary>Documents the optional product target on actions that validate independent exports.</summary>
    public sealed class ExportTargetOperationFilter : IOperationFilter
    {
        /// <summary>Adds or updates the export-target query parameter without changing runtime validation.</summary>
        /// <param name="operation">The generated operation whose query parameters are being documented.</param>
        /// <param name="context">The action metadata used to identify export-target validation.</param>
        public void Apply(OpenApiOperation operation, OperationFilterContext context) {
            if (context.MethodInfo.GetCustomAttribute<ValidateExportTargetAttribute>() == null)
                return;

            operation.Parameters ??= [];

            var existingParameter = operation.Parameters.FirstOrDefault(candidate =>
                candidate.In == ParameterLocation.Query &&
                string.Equals(candidate.Name, ExportTargetContract.QueryParameterName, StringComparison.Ordinal));
            var parameter = existingParameter as OpenApiParameter;
            if (parameter == null) {
                parameter = new OpenApiParameter {
                    Name = ExportTargetContract.QueryParameterName,
                    In = ParameterLocation.Query
                };
                if (existingParameter == null)
                    operation.Parameters.Add(parameter);
                else
                    // A referenced parameter is read-only; keep this contract local to the operation.
                    operation.Parameters[operation.Parameters.IndexOf(existingParameter)] = parameter;
            }

            parameter.Required = false;
            parameter.Description = "Independent product export target. Matching is case-insensitive. Missing values default to S101.";
            parameter.Schema = new OpenApiSchema {
                Type = JsonSchemaType.String,
                Enum = ExportTargetContract.AllowedTargets
                    .Select(value => (JsonNode)JsonValue.Create(value)!)
                    .ToList(),
                Default = JsonValue.Create(ExportTargetContract.DefaultTarget)
            };
        }
    }
}
