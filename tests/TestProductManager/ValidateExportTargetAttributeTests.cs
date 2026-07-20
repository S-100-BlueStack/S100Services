using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using ProductManagerAPI.Controllers;
using ProductManagerAPI.Filters;
using ProductManagerAPI.Services.Export;
using S100FC.ProductCatalogue;
using static ProductManagerAPI.Models.RequestTypes;
using static ProductManagerAPI.Models.ResponseTypes;

namespace TestProductManagerAPI
{
    public class ValidateExportTargetAttributeTests
    {
        [Theory]
        [InlineData(nameof(ExportController.NewEdition))]
        [InlineData(nameof(ExportController.NewUpdate))]
        public void ExportActionsUseTheSharedTargetValidationFilter(string methodName) {
            var method = typeof(ExportController).GetMethod(methodName)
                ?? throw new InvalidOperationException($"Method {methodName} was not found.");

            Assert.NotEmpty(method.GetCustomAttributes(typeof(ValidateExportTargetAttribute), true));
        }

        [Fact]
        public async Task MissingTargetDefaultsToS100BeforeTheActionRuns() {
            var run = await RunFilterAsync(null);

            Assert.True(run.NextCalled);
            Assert.Null(run.Result);
            Assert.Equal(ExportFormat.S100, ExportTargetContract.GetValidatedTarget(run.HttpContext));
        }

        [Theory]
        [InlineData("?exportTarget=S100")]
        [InlineData("?exportTarget=s100")]
        public async Task S100CasingVariantsReachTheAction(string queryString) {
            var run = await RunFilterAsync(queryString);

            Assert.True(run.NextCalled);
            Assert.Equal(ExportFormat.S100, ExportTargetContract.GetValidatedTarget(run.HttpContext));
        }

        [Theory]
        [InlineData("?exportTarget=")]
        [InlineData("?exportTarget=%20%20%20")]
        [InlineData("?exportTarget=Both")]
        [InlineData("?exportTarget=0")]
        [InlineData("?exportTarget=1")]
        [InlineData("?exportTarget=2")]
        [InlineData("?exportTarget=42")]
        [InlineData("?exportTarget=Unknown")]
        public async Task InvalidTargetsStopBeforeProductLookupAndMutation(string queryString) {
            var run = await RunFilterAsync(queryString);

            Assert.False(run.NextCalled);
            AssertProblem(run.Result, StatusCodes.Status400BadRequest, ExportTargetContract.InvalidTargetCode);
        }

        [Theory]
        [InlineData("?exportTarget=All")]
        [InlineData("?exportTarget=S57")]
        public async Task UnsupportedTargetsStopBeforeProductLookupAndMutation(string queryString) {
            var run = await RunFilterAsync(queryString);

            Assert.False(run.NextCalled);
            AssertProblem(
                run.Result,
                StatusCodes.Status422UnprocessableEntity,
                ExportTargetContract.UnsupportedTargetCode
            );
        }

        [Theory]
        [InlineData("?exportTarget=All")]
        [InlineData("?exportTarget=S57")]
        public async Task NewUpdateUnsupportedTargetsReturnUnprocessableEntityBeforeTheActionRuns(
            string queryString
        ) {
            var run = await RunFilterAsync(queryString, _ => throw new InvalidOperationException(
                "New Update must not run for an unsupported target."
            ));

            Assert.False(run.NextCalled);
            AssertProblem(
                run.Result,
                StatusCodes.Status422UnprocessableEntity,
                ExportTargetContract.UnsupportedTargetCode
            );
        }

        [Theory]
        [InlineData("?exportTarget=Both")]
        [InlineData("?exportTarget=0")]
        [InlineData("?exportTarget=1")]
        [InlineData("?exportTarget=2")]
        [InlineData("?exportTarget=42")]
        [InlineData("?exportTarget=Unknown")]
        public async Task NewUpdateInvalidTargetsReturnBadRequestBeforeTheActionRuns(
            string queryString
        ) {
            var run = await RunFilterAsync(queryString, _ => throw new InvalidOperationException(
                "New Update must not run for an invalid target."
            ));

            Assert.False(run.NextCalled);
            AssertProblem(
                run.Result,
                StatusCodes.Status400BadRequest,
                ExportTargetContract.InvalidTargetCode
            );
        }

        [Fact]
        public async Task NewUpdateWithS100RetainsTheExistingNotImplementedResponse() {
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var controller = new ExportController(
                NullLogger<ExportController>.Instance,
                cache,
                null!,
                new EmptyProductManager(),
                null!,
                null!
            );

            var run = await RunFilterAsync("?exportTarget=S100", async httpContext => {
                controller.ControllerContext = new ControllerContext(new ActionContext(
                    httpContext,
                    new RouteData(),
                    new ActionDescriptor()
                ));

                return await controller.NewUpdate("101DK0040943E", CancellationToken.None);
            });

            Assert.True(run.NextCalled);

            var objectResult = Assert.IsType<ObjectResult>(run.Result);
            Assert.Equal(StatusCodes.Status501NotImplemented, objectResult.StatusCode);

            var response = Assert.IsType<ApiResponse>(objectResult.Value);
            Assert.False(response.Success);
            Assert.Equal("NewUpdate is not implemented yet.", response.Message);
        }

        private static async Task<FilterRun> RunFilterAsync(
            string? queryString,
            Func<DefaultHttpContext, Task<IActionResult?>>? action = null
        ) {
            var httpContext = new DefaultHttpContext();

            if (queryString != null) {
                httpContext.Request.QueryString = new QueryString(queryString);
            }

            var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
            var filters = new List<IFilterMetadata>();
            var controller = new object();
            var executingContext = new ActionExecutingContext(
                actionContext,
                filters,
                new Dictionary<string, object?>(),
                controller
            );

            var nextCalled = false;
            IActionResult? actionResult = null;

            ActionExecutionDelegate next = async () => {
                nextCalled = true;
                actionResult = action == null ? null : await action(httpContext);
                return new ActionExecutedContext(actionContext, filters, controller) {
                    Result = actionResult
                };
            };

            var filter = new ValidateExportTargetAttribute();
            await filter.OnActionExecutionAsync(executingContext, next);

            return new FilterRun(
                httpContext,
                nextCalled,
                executingContext.Result ?? actionResult
            );
        }

        private static void AssertProblem(IActionResult? result, int status, string code) {
            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(status, objectResult.StatusCode);

            Assert.Contains("application/problem+json", objectResult.ContentTypes);

            var problemDetails = Assert.IsType<ProblemDetails>(objectResult.Value);
            Assert.Equal(status, problemDetails.Status);
            Assert.Equal(code, problemDetails.Extensions["code"]);
        }

        private sealed record FilterRun(
            DefaultHttpContext HttpContext,
            bool NextCalled,
            IActionResult? Result
        );

        private sealed class EmptyProductManager : IProductManager
        {
            public INauticalProductManager NauticalProductManager => null!;
            public IElectronicProductManager ElectronicProductManager => null!;
        }
    }
}
