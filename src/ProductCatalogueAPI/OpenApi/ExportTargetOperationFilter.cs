using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.Services.Export;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Reflection;

namespace ProductCatalogueAPI.OpenApi
{
    public sealed class ExportTargetOperationFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context) {
            if (context.MethodInfo.GetCustomAttribute<ValidateExportTargetAttribute>() == null)
                return;

            operation.Parameters ??= [];

            var parameter = operation.Parameters.FirstOrDefault(candidate =>
                candidate.In == ParameterLocation.Query &&
                string.Equals(candidate.Name, ExportTargetContract.QueryParameterName, StringComparison.Ordinal));

            if (parameter == null) {
                parameter = new OpenApiParameter {
                    Name = ExportTargetContract.QueryParameterName,
                    In = ParameterLocation.Query
                };
                operation.Parameters.Add(parameter);
            }

            parameter.Required = false;
            parameter.Description = "Export target. Matching is case-insensitive. Missing values default to S100.";
            parameter.Schema = new OpenApiSchema {
                Type = "string",
                Enum = ExportTargetContract.AllowedTargets
                    .Select(value => (IOpenApiAny)new OpenApiString(value))
                    .ToList(),
                Default = new OpenApiString(ExportTargetContract.DefaultTarget)
            };
        }
    }
}
