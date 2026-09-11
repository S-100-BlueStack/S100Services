using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Dashboard;
using S100FC.ProductCatalogue;
using System.Reflection;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace TestProductCatalogueAPI;

public class DashboardControllerSortTests
{
    [Theory]
    [InlineData("sortBy", "invalid")]
    [InlineData("sortBy", "")]
    [InlineData("sortBy", "   ")]
    [InlineData("sortDirection", "invalid")]
    [InlineData("sortDirection", "")]
    [InlineData("sortDirection", "   ")]
    public async Task InvalidSortReturnsBadRequestBeforeRepositoryAccess(string parameter, string value)
    {
        var controller = CreateController();
        controller.HttpContext.Request.QueryString = QueryString.Create(parameter, value);
        // MVC binds an empty or whitespace-only string to null by default.
        var boundValue = string.IsNullOrWhiteSpace(value) ? null : value;
        var result = await controller.GetElectronicProductsDashboard("2026-07-20", "2026-07-27",
            sortBy: parameter == "sortBy" ? boundValue : null,
            sortDirection: parameter == "sortDirection" ? boundValue : null);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
        var response = Assert.IsType<ApiResponse>(badRequest.Value);
        Assert.False(response.Success);
        Assert.Equal(parameter == "sortBy"
            ? "The 'sortBy' query parameter must be one of: time, product, activity, status."
            : "The 'sortDirection' query parameter must be one of: asc, desc.", response.Message);
    }

    [Theory]
    [InlineData("status", "asc")]
    [InlineData("product", "desc")]
    public async Task CursorSortMismatchReturnsBadRequestBeforeRepositoryAccess(string field, string direction)
    {
        var timestamp = DateTimeOffset.Parse("2026-07-21T10:00:00+02:00");
        var page = DashboardQueryProcessor.Execute(new[]
        {
            new DashboardActivityResponse
                {
                    Id = "a",
                    DatasetName = "A",
                    ProductName = "A",
                    Type = "export",
                    Severity = "info",
                    Title = "Export",
                    Status = "Completed",
                    Timestamp = timestamp
                },
                new DashboardActivityResponse
                {
                    Id = "b",
                    DatasetName = "B",
                    ProductName = "B",
                    Type = "export",
                    Severity = "info",
                    Title = "Export",
                    Status = "Completed",
                    Timestamp = timestamp
                }
        }, new DashboardQueryOptions("", "all", "all", "all", "all", "all", 1, null, "product", "asc"));
        var result = await CreateController().GetElectronicProductsDashboard("2026-07-20", "2026-07-27",
            pageSize: 1, cursor: page.Paging.NextCursor, sortBy: field, sortDirection: direction);

        var response = Assert.IsType<ApiResponse>(Assert.IsType<BadRequestObjectResult>(result).Value);
        Assert.False(response.Success);
        Assert.Equal("The 'cursor' query parameter does not match the requested sort.", response.Message);
    }

    private static ElectronicProductsController CreateController() => new(
        NullLogger<ElectronicProductsController>.Instance,
        null!,
        new UnusedProductManager(),
        DispatchProxy.Create<IProductRepository, RejectRepositoryAccess>(),
        DispatchProxy.Create<IProductWorkflowRepository, RejectRepositoryAccess>())
    {
        ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
    };

    private sealed class UnusedProductManager : IProductManager
    {
        public INauticalProductManager NauticalProductManager => throw new InvalidOperationException();
        public IElectronicProductManager ElectronicProductManager => null!;
    }

    public class RejectRepositoryAccess : DispatchProxy
    {
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
            throw new InvalidOperationException("Invalid Dashboard queries must not access the repository.");
    }
}
