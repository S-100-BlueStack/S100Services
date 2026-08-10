using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProductCatalogueAPI;
using ProductCatalogueAPI.Services.Locking;

namespace TestProductCatalogueAPI
{
    [Trait("Package", "PC-005")]
    public sealed class CustomExceptionHandlerHttpBoundaryTests
    {
        private const string RequestPath = "/pc-005/exception";
        private const string ExpectedTitle = "An error occurred while processing your request.";
        private const string SensitiveMarker = "PC005_INTERNAL_SECRET";

        [Theory]
        [InlineData(nameof(BadHttpRequestException), StatusCodes.Status400BadRequest)]
        [InlineData(nameof(UnauthorizedAccessException), StatusCodes.Status401Unauthorized)]
        [InlineData(nameof(DatasetLockedException), StatusCodes.Status409Conflict)]
        [InlineData("GenericException", StatusCodes.Status500InternalServerError)]
        public async Task ExceptionMiddlewareWritesMatchingHttpAndProblemDetailsStatus(
            string exceptionType,
            int expectedStatusCode
        ) {
            var exception = CreateException(exceptionType);

            var response = await ExecuteThroughHttpPipelineAsync(exception);

            Assert.Equal(expectedStatusCode, response.StatusCode);
            Assert.NotEqual(StatusCodes.Status200OK, response.StatusCode);
            AssertProblemDetailsContentType(response.ContentType);

            using var document = JsonDocument.Parse(response.Body);
            var root = document.RootElement;

            Assert.Equal(response.StatusCode, root.GetProperty("status").GetInt32());
            Assert.Equal(ExpectedTitle, root.GetProperty("title").GetString());
            Assert.Equal(RequestPath, root.GetProperty("instance").GetString());

            if (root.TryGetProperty("detail", out var detail))
                Assert.Equal(JsonValueKind.Null, detail.ValueKind);

            AssertResponseDoesNotContain(response.Body, SensitiveMarker, StringComparison.Ordinal);
            AssertResponseDoesNotContain(response.Body, "stackTrace", StringComparison.OrdinalIgnoreCase);
            AssertResponseDoesNotContain(response.Body, exception.GetType().FullName!, StringComparison.Ordinal);
            AssertResponseDoesNotContain(response.Body, "SELECT * FROM", StringComparison.OrdinalIgnoreCase);
            AssertResponseDoesNotContain(
                response.Body,
                @"C:\private\product-manager.config",
                StringComparison.OrdinalIgnoreCase
            );
        }

        private static Exception CreateException(string exceptionType) {
            var sensitiveMessage = $"{SensitiveMarker}: SELECT * FROM InternalJobs; C:\\private\\product-manager.config";

            return exceptionType switch {
                nameof(BadHttpRequestException) => new BadHttpRequestException(sensitiveMessage),
                nameof(UnauthorizedAccessException) => new UnauthorizedAccessException(sensitiveMessage),
                nameof(DatasetLockedException) => new DatasetLockedException($"{SensitiveMarker}_DATASET"),
                "GenericException" => new InvalidOperationException(sensitiveMessage),
                _ => throw new ArgumentOutOfRangeException(nameof(exceptionType), exceptionType, null),
            };
        }

        private static async Task<ResponseSnapshot> ExecuteThroughHttpPipelineAsync(Exception exception) {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions {
                EnvironmentName = Environments.Production,
            });
            builder.Logging.ClearProviders();
            builder.Services.AddProblemDetails();
            builder.Services.AddExceptionHandler<CustomExceptionHandler>();

            await using var app = builder.Build();
            var pipelineBuilder = new ApplicationBuilder(app.Services);
            pipelineBuilder.UseExceptionHandler();
            pipelineBuilder.Run(_ => Task.FromException(exception));
            var pipeline = pipelineBuilder.Build();

            await using var responseBody = new MemoryStream();
            var context = new DefaultHttpContext {
                RequestServices = app.Services,
            };
            context.Request.Path = RequestPath;
            context.Response.Body = responseBody;

            await pipeline(context);

            responseBody.Position = 0;
            using var reader = new StreamReader(responseBody);
            var body = await reader.ReadToEndAsync();

            return new ResponseSnapshot(
                context.Response.StatusCode,
                context.Response.ContentType,
                body
            );
        }

        private static void AssertResponseDoesNotContain(
            string responseBody,
            string forbiddenValue,
            StringComparison comparison
        ) {
            Assert.False(
                responseBody.Contains(forbiddenValue, comparison),
                $"The response body contained forbidden internal value '{forbiddenValue}'."
            );
        }

        private static void AssertProblemDetailsContentType(string? contentType) {
            Assert.False(string.IsNullOrWhiteSpace(contentType));
            var parsed = MediaTypeHeaderValue.Parse(contentType!);
            Assert.Equal("application/problem+json", parsed.MediaType);
        }

        private sealed record ResponseSnapshot(int StatusCode, string? ContentType, string Body);
    }
}
