using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Reflection;

namespace TestProductCatalogueAPI
{
    public class ExportTargetOperationFilterTests
    {
        /// <summary>Unsupported update and superseded edition routes are removed from the controller surface.</summary>
        [Fact]
        public void UnsupportedManualEndpointsAreRemoved() {
            Assert.Null(typeof(ExportController).GetMethod("NewUpdate"));
            Assert.Null(typeof(ExportController).GetMethod("NewEdition"));
        }

        [Theory]
        [InlineData(nameof(ExportController.NewExport), "{packageName}/newexport")]
        [InlineData(nameof(ExportController.Discard), "{name}/discard")]
        public void QueuedExportRoutesUseTheirCurrentNames(string methodName, string expectedRoute) {
            var method = typeof(ExportController).GetMethod(methodName)
                ?? throw new InvalidOperationException($"Method {methodName} was not found.");

            var route = method.GetCustomAttributes<HttpPostAttribute>().Single().Template;
            Assert.Equal(expectedRoute, route);
        }

        [Theory]
        [InlineData(nameof(ExportController.NewExport))]
        [InlineData(nameof(ExportController.Discard))]
        public void QueuedExportRoutesDoNotAdvertiseAnExportTarget(string methodName) {
            var method = typeof(ExportController).GetMethod(methodName)
                ?? throw new InvalidOperationException($"Method {methodName} was not found.");

            var operation = new OpenApiOperation();
            var context = new OperationFilterContext(new ApiDescription(), null!, new SchemaRepository(), new OpenApiDocument(), method);

            new ExportTargetOperationFilter().Apply(operation, context);

            Assert.True(operation.Parameters is null || operation.Parameters.Count == 0);
        }
    }
}
