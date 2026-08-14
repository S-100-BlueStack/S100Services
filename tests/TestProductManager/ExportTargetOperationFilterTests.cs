using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.OpenApi;
using ProductCatalogueAPI.Services.Export;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace TestProductCatalogueAPI
{
    public class ExportTargetOperationFilterTests
    {
        [Theory]
        [InlineData(nameof(ExportController.NewEdition))]
        [InlineData(nameof(ExportController.NewUpdate))]
        [InlineData(nameof(ExportController.NewEditionJob))]
        [InlineData(nameof(ExportController.NewUpdateJob))]
        [InlineData(nameof(ExportController.CancelExport))]
        public void SwaggerShowsOnlyCanonicalReadableTargetValues(string methodName) {
            var method = typeof(ExportController).GetMethod(methodName)
                ?? throw new InvalidOperationException($"Method {methodName} was not found.");

            var operation = new OpenApiOperation();
            var context = new OperationFilterContext(
                new ApiDescription(),
                null!,
                new SchemaRepository(),
                method
            );

            new ExportTargetOperationFilter().Apply(operation, context);

            var parameter = Assert.Single(operation.Parameters);
            Assert.Equal(ExportTargetContract.QueryParameterName, parameter.Name);
            Assert.Equal(ParameterLocation.Query, parameter.In);
            Assert.False(parameter.Required);
            Assert.Equal("string", parameter.Schema.Type);
            Assert.Equal(
                new[] { "S57", "S101", "S102", "S122" },
                parameter.Schema.Enum.Cast<OpenApiString>().Select(value => value.Value)
            );
            Assert.Equal(
                ExportTargetContract.DefaultTarget,
                Assert.IsType<OpenApiString>(parameter.Schema.Default).Value
            );
        }
    }
}
