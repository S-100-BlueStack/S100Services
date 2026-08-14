using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace ProductCatalogueAPI.OpenApi;

public sealed class SwaggerAllowedValuesOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context) {
        foreach (var methodParameter in context.MethodInfo.GetParameters()) {
            var allowedValues = methodParameter.GetCustomAttributes(typeof(SwaggerAllowedValuesAttribute), false)
                .Cast<SwaggerAllowedValuesAttribute>()
                .SingleOrDefault();
            if (allowedValues == null)
                continue;

            var operationParameter = operation.Parameters?.FirstOrDefault(parameter => string.Equals(parameter.Name, methodParameter.Name, StringComparison.OrdinalIgnoreCase));
            if (operationParameter == null)
                continue;

            operationParameter.Schema ??= new OpenApiSchema { Type = "string" };
            operationParameter.Schema.Type = "string";
            operationParameter.Schema.Enum = allowedValues.Values
                .Select(value => (IOpenApiAny)new OpenApiString(value))
                .ToList();
            if (methodParameter.DefaultValue is string defaultValue)
                operationParameter.Schema.Default = new OpenApiString(defaultValue);
        }
    }
}
