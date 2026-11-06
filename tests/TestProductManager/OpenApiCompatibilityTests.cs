using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.OpenApi;
using ProductCatalogueAPI.Services.Export;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Text.Json.Nodes;

namespace TestProductCatalogueAPI;

/// <summary>Checks the generated Swagger contract against the OpenAPI model used by Swashbuckle 10.</summary>
public sealed class OpenApiCompatibilityTests
{
    /// <summary>Export targets remain optional string values with the canonical default in serialized JSON.</summary>
    [Fact]
    public void ExportTargetSchemaSerializesItsEnumAndDefault() {
        var operation = new OpenApiOperation();
        new ExportTargetOperationFilter().Apply(operation, CreateContext(nameof(FilterActions.Export)));

        var parameter = Assert.IsType<OpenApiParameter>(Assert.Single(operation.Parameters!));
        Assert.Equal(ParameterLocation.Query, parameter.In);
        Assert.False(parameter.Required);
        var json = SerializeParameter(parameter);
        Assert.Equal(ExportTargetContract.QueryParameterName, json["name"]!.GetValue<string>());
        Assert.Equal("string", json["schema"]!["type"]!.GetValue<string>());
        Assert.Equal(ExportTargetContract.AllowedTargets, json["schema"]!["enum"]!.AsArray().Select(value => value!.GetValue<string>()));
        Assert.Equal(ExportTargetContract.DefaultTarget, json["schema"]!["default"]!.GetValue<string>());
    }

    /// <summary>Existing export-target parameters are updated without duplicating the query argument.</summary>
    [Fact]
    public void ExportTargetReusesAnExistingInlineParameter() {
        var parameter = new OpenApiParameter { Name = ExportTargetContract.QueryParameterName, In = ParameterLocation.Query, Required = true };
        var operation = new OpenApiOperation { Parameters = [parameter] };

        new ExportTargetOperationFilter().Apply(operation, CreateContext(nameof(FilterActions.Export)));

        Assert.Same(parameter, Assert.Single(operation.Parameters));
        Assert.False(parameter.Required);
        Assert.Equal(JsonSchemaType.String, parameter.Schema!.Type);
    }

    /// <summary>Referenced export parameters become local overrides without changing their shared definitions.</summary>
    [Fact]
    public void ExportTargetDoesNotMutateAReferencedParameter() {
        var shared = new OpenApiParameter { Name = ExportTargetContract.QueryParameterName, In = ParameterLocation.Query, Required = true };
        var document = new OpenApiDocument { Components = new OpenApiComponents { Parameters = new Dictionary<string, IOpenApiParameter> { ["ExportTarget"] = shared } } };
        document.RegisterComponents();
        var operation = new OpenApiOperation { Parameters = [new OpenApiParameterReference("ExportTarget", document)] };

        new ExportTargetOperationFilter().Apply(operation, CreateContext(nameof(FilterActions.Export)));

        var parameter = Assert.IsType<OpenApiParameter>(Assert.Single(operation.Parameters));
        Assert.NotSame(shared, parameter);
        Assert.True(shared.Required);
        Assert.False(parameter.Required);
    }

    /// <summary>Dropdown values work with missing schemas and preserve constraints on existing schemas.</summary>
    /// <param name="hasSchema">Whether Swagger has already generated an inline schema.</param>
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void AllowedValuesSerializeWithoutMutatingTheOriginalSchema(bool hasSchema) {
        var original = hasSchema ? new OpenApiSchema { Type = JsonSchemaType.String, MinLength = 1 } : null;
        var parameter = new OpenApiParameter { Name = "LAYER", In = ParameterLocation.Query, Schema = original };
        var operation = new OpenApiOperation { Parameters = [parameter] };

        new SwaggerAllowedValuesOperationFilter().Apply(operation, CreateContext(nameof(FilterActions.Layer)));

        var schema = Assert.IsType<OpenApiSchema>(parameter.Schema);
        Assert.NotSame(original, schema);
        if (original != null) {
            Assert.Equal(original.MinLength, schema.MinLength);
            Assert.True(original.Enum is null || original.Enum.Count == 0);
            Assert.Null(original.Default);
        }
        var json = SerializeParameter(parameter);
        Assert.Equal("string", json["schema"]!["type"]!.GetValue<string>());
        Assert.Equal(new[] { "ENC" }, json["schema"]!["enum"]!.AsArray().Select(value => value!.GetValue<string>()));
        Assert.Equal("ENC", json["schema"]!["default"]!.GetValue<string>());
    }

    /// <summary>Creates action metadata without initializing application services or ArcGIS.</summary>
    /// <param name="methodName">The local action whose attributes the filter should inspect.</param>
    /// <returns>A context for the selected action.</returns>
    private static OperationFilterContext CreateContext(string methodName) => new(new ApiDescription(), null!, new SchemaRepository(), new OpenApiDocument(), typeof(FilterActions).GetMethod(methodName)!);

    /// <summary>Serializes through the actual OpenAPI writer so tests verify the public JSON contract.</summary>
    /// <param name="parameter">The parameter produced by an operation filter.</param>
    /// <returns>The parameter's serialized JSON object.</returns>
    private static JsonObject SerializeParameter(OpenApiParameter parameter) {
        using var output = new StringWriter();
        parameter.SerializeAsV3(new OpenApiJsonWriter(output));
        return JsonNode.Parse(output.ToString())!.AsObject();
    }

    /// <summary>Provides action metadata without exposing fixture methods as discoverable tests.</summary>
    private sealed class FilterActions
    {
        /// <summary>Supplies export metadata without executing an export.</summary>
        [ValidateExportTarget]
        public void Export() { }

        /// <summary>Supplies dropdown metadata without executing an API action.</summary>
        /// <param name="layer">The canonical layer default advertised to Swagger clients.</param>
        public void Layer([SwaggerAllowedValues("ENC")] string layer = "ENC") { }
    }
}
