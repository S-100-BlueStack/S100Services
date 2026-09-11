using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi.Models;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace TestProductCatalogueAPI
{
    public class ExportTargetOperationFilterTests
    {
        [Theory]
        [InlineData(nameof(ExportController.NewEdition), "{name}/newedition")]
        [InlineData(nameof(ExportController.NewUpdate), "{name}/newupdate")]
        [InlineData(nameof(ExportController.CancelExport), "{name}/cancel-export")]
        public void QueuedExportRoutesUseTheirProductSpecificNames(string methodName, string expectedRoute) {
            var method = typeof(ExportController).GetMethod(methodName)
                ?? throw new InvalidOperationException($"Method {methodName} was not found.");

            var route = method.GetCustomAttributes<HttpPostAttribute>().Single().Template;
            Assert.Equal(expectedRoute, route);
        }

        [Theory]
        [InlineData(nameof(ExportController.NewEdition))]
        [InlineData(nameof(ExportController.NewUpdate))]
        [InlineData(nameof(ExportController.CancelExport))]
        public void QueuedExportRoutesDoNotAdvertiseAnExportTarget(string methodName) {
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

            Assert.True(operation.Parameters is null || operation.Parameters.Count == 0);
        }
    }
}
