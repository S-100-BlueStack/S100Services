using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace TestProductCatalogueAPI;

public sealed class SwaggerAllowedValuesOperationFilterTests
{
    [Fact]
    public void ElectronicProductAoiSpecificationUsesCanonicalDropdownValues() {
        var method = typeof(ElectronicProductsController).GetMethod(nameof(ElectronicProductsController.GetAllElectronicProductsAOI))
            ?? throw new InvalidOperationException("AOI action was not found.");
        var operation = new OpenApiOperation {
            Parameters = [new OpenApiParameter { Name = "productSpecification", In = ParameterLocation.Query, Schema = new OpenApiSchema() }]
        };
        var context = new OperationFilterContext(new ApiDescription(), null!, new SchemaRepository(), method);

        new SwaggerAllowedValuesOperationFilter().Apply(operation, context);

        var parameter = Assert.Single(operation.Parameters);
        Assert.Equal("string", parameter.Schema.Type);
        Assert.Equal(new[] { "S57", "S101" }, parameter.Schema.Enum.Cast<OpenApiString>().Select(value => value.Value));
        Assert.Equal("S101", Assert.IsType<OpenApiString>(parameter.Schema.Default).Value);
    }
}
