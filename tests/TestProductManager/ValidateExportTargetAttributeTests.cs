using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.Services.Export;

namespace TestProductCatalogueAPI;

public sealed class ValidateExportTargetAttributeTests
{
    [Fact]
    public async Task MissingTargetStoresS101AndRunsAction() {
        var (context, nextCalled, result) = await RunAsync(null);
        Assert.True(nextCalled);
        Assert.Null(result);
        Assert.Equal(ProductSpecification.S101, ExportTargetContract.GetValidatedTarget(context));
    }

    [Theory]
    [InlineData("?exportTarget=S102", StatusCodes.Status422UnprocessableEntity)]
    [InlineData("?exportTarget=S100", StatusCodes.Status400BadRequest)]
    public async Task UnsupportedOrInvalidTargetStopsBeforeAction(string query, int status) {
        var (_, nextCalled, result) = await RunAsync(query);
        Assert.False(nextCalled);
        Assert.Equal(status, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    private static async Task<(DefaultHttpContext Context, bool NextCalled, IActionResult? Result)> RunAsync(string? query) {
        var httpContext = new DefaultHttpContext();
        if (query is not null)
            httpContext.Request.QueryString = new QueryString(query);
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var filters = new List<IFilterMetadata>();
        var executing = new ActionExecutingContext(actionContext, filters, new Dictionary<string, object?>(), new object());
        var nextCalled = false;
        ActionExecutionDelegate next = () => { nextCalled = true; return Task.FromResult(new ActionExecutedContext(actionContext, filters, new object())); };
        await new ValidateExportTargetAttribute().OnActionExecutionAsync(executing, next);
        return (httpContext, nextCalled, executing.Result);
    }
}
