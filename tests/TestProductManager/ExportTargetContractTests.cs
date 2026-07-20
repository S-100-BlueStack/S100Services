using Microsoft.AspNetCore.Mvc;
using ProductManagerAPI.Services.Export;
using static ProductManagerAPI.Models.RequestTypes;

namespace TestProductManagerAPI
{
    public class ExportTargetContractTests
    {
        [Fact]
        public void MissingTargetDefaultsToS100() {
            var result = ExportTargetContract.ParseAndValidate(null);

            Assert.True(result.IsValid);
            Assert.Equal(ExportFormat.S100, result.Target.GetValueOrDefault());
            Assert.Null(result.ProblemDetails);
        }

        [Theory]
        [InlineData("S100")]
        [InlineData("s100")]
        public void S100ParsingIsCaseInsensitive(string value) {
            var result = ExportTargetContract.ParseAndValidate(value);

            Assert.True(result.IsValid);
            Assert.Equal(ExportFormat.S100, result.Target.GetValueOrDefault());
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("Both")]
        [InlineData("both")]
        [InlineData("0")]
        [InlineData("1")]
        [InlineData("2")]
        [InlineData("42")]
        [InlineData("-1")]
        [InlineData("+1")]
        [InlineData("01")]
        [InlineData("1.0")]
        [InlineData("Unknown")]
        public void InvalidTargetsReturnScopedBadRequestProblemDetails(string value) {
            var result = ExportTargetContract.ParseAndValidate(value);

            Assert.False(result.IsValid);
            Assert.Null(result.Target);

            var problemDetails = Assert.IsType<ProblemDetails>(result.ProblemDetails);
            Assert.Equal(StatusCodes.Status400BadRequest, problemDetails.Status);
            Assert.Equal(ExportTargetContract.InvalidTargetCode, problemDetails.Extensions["code"]);
            Assert.Equal(
                new[] { "All", "S100", "S57" },
                Assert.IsType<string[]>(problemDetails.Extensions["allowedTargets"])
            );
        }

        [Theory]
        [InlineData("All")]
        [InlineData("all")]
        [InlineData("S57")]
        [InlineData("s57")]
        public void UnsupportedTargetsReturnScopedUnprocessableEntityProblemDetails(string value) {
            var result = ExportTargetContract.ParseAndValidate(value);

            Assert.False(result.IsValid);
            Assert.Null(result.Target);

            var problemDetails = Assert.IsType<ProblemDetails>(result.ProblemDetails);
            Assert.Equal(StatusCodes.Status422UnprocessableEntity, problemDetails.Status);
            Assert.Equal(ExportTargetContract.UnsupportedTargetCode, problemDetails.Extensions["code"]);
            Assert.Equal(
                new[] { "S100" },
                Assert.IsType<string[]>(problemDetails.Extensions["supportedTargets"])
            );
        }
    }
}
