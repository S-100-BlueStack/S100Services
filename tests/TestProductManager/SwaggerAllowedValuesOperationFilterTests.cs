using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace TestProductCatalogueAPI;

public sealed class SwaggerAllowedValuesOperationFilterTests
{
    /// <summary>Preserves the AOI layer dropdown and default with the OpenAPI JSON-node model.</summary>
    [Fact]
    public void ElectronicProductAoiLayerUsesCanonicalDropdownValue() {
        var method = typeof(ElectronicProductsController).GetMethod(nameof(ElectronicProductsController.GetAllElectronicProductsAOI))
            ?? throw new InvalidOperationException("AOI action was not found.");
        var operation = new OpenApiOperation {
            Parameters = [new OpenApiParameter { Name = "layer", In = ParameterLocation.Query, Schema = new OpenApiSchema() }]
        };
        var context = new OperationFilterContext(new ApiDescription(), null!, new SchemaRepository(), new OpenApiDocument(), method);

        new SwaggerAllowedValuesOperationFilter().Apply(operation, context);

        var parameter = Assert.Single(operation.Parameters);
        var schema = Assert.IsType<OpenApiSchema>(parameter.Schema);
        Assert.Equal(JsonSchemaType.String, schema.Type);
        Assert.Equal(new[] { "ENC" }, schema.Enum!.Select(value => value.GetValue<string>()));
        Assert.Equal("ENC", schema.Default!.GetValue<string>());
    }
}
