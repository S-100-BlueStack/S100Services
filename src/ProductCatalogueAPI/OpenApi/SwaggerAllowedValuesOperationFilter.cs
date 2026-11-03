using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Text.Json.Nodes;

namespace ProductCatalogueAPI.OpenApi;

/// <summary>Documents allowed string values and defaults declared on action parameters.</summary>
public sealed class SwaggerAllowedValuesOperationFilter : IOperationFilter
{
    /// <summary>Updates generated inline parameters while preserving their other schema constraints.</summary>
    /// <param name="operation">The generated operation containing the action's parameters.</param>
    /// <param name="context">The action metadata containing allowed-value attributes and defaults.</param>
    public void Apply(OpenApiOperation operation, OperationFilterContext context) {
        foreach (var methodParameter in context.MethodInfo.GetParameters()) {
            var allowedValues = methodParameter.GetCustomAttributes(typeof(SwaggerAllowedValuesAttribute), false)
                .Cast<SwaggerAllowedValuesAttribute>()
                .SingleOrDefault();
            if (allowedValues == null)
                continue;

            var operationParameter = operation.Parameters?.OfType<OpenApiParameter>()
                .FirstOrDefault(parameter => string.Equals(parameter.Name, methodParameter.Name, StringComparison.OrdinalIgnoreCase));
            if (operationParameter == null)
                continue;

            // The interfaces expose read-only properties; update a concrete, operation-local schema.
            var schema = operationParameter.Schema?.CreateShallowCopy() as OpenApiSchema ?? new OpenApiSchema();
            schema.Type = JsonSchemaType.String;
            schema.Enum = allowedValues.Values
                .Select(value => (JsonNode)JsonValue.Create(value)!)
                .ToList();
            if (methodParameter.DefaultValue is string defaultValue)
                schema.Default = JsonValue.Create(defaultValue);
            operationParameter.Schema = schema;
        }
    }
}
