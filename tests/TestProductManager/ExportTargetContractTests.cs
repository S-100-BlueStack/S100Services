using Microsoft.AspNetCore.Http;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Export;

namespace TestProductCatalogueAPI;

public sealed class ExportTargetContractTests
{
    [Theory]
    [InlineData(null, ProductSpecification.S101)]
    [InlineData("s101", ProductSpecification.S101)]
    [InlineData("S57", ProductSpecification.S57)]
    public void ImplementedTargetsAreAccepted(string? value, ProductSpecification expected) {
        var result = ExportTargetContract.ParseAndValidate(value);
        Assert.True(result.IsValid);
        Assert.Equal(expected, result.Target);
    }

    [Theory]
    [InlineData("S102")]
    [InlineData("S122")]
    public void ScaffoldedTargetsReturnUnprocessableEntity(string value) {
        var result = ExportTargetContract.ParseAndValidate(value);
        Assert.False(result.IsValid);
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, result.ProblemDetails!.Status);
    }

    [Theory]
    [InlineData("")]
    [InlineData("S100")]
    [InlineData("Both")]
    [InlineData("1")]
    public void InvalidTargetsReturnBadRequest(string value) {
        var result = ExportTargetContract.ParseAndValidate(value);
        Assert.False(result.IsValid);
        Assert.Equal(StatusCodes.Status400BadRequest, result.ProblemDetails!.Status);
    }
}
