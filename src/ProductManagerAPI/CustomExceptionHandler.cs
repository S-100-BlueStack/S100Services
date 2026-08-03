using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ProductManagerAPI.Services.Locking;

namespace ProductManagerAPI
{
    public class CustomExceptionHandler(ILogger<CustomExceptionHandler> logger) : IExceptionHandler
    {
        private const string ProblemDetailsContentType = "application/problem+json";
        private readonly ILogger<CustomExceptionHandler> _logger = logger;

        public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken) {
            var statusCode = exception switch {
                BadHttpRequestException => StatusCodes.Status400BadRequest,
                UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
                DatasetLockedException => StatusCodes.Status409Conflict,

                _ => StatusCodes.Status500InternalServerError
            };
            this._logger.LogError(exception, "An exception occurred. Message: {Message}", exception.Message);

            var problemDetails = new ProblemDetails {
                Title = "An error occurred while processing your request.",
                Status = statusCode,
                Instance = httpContext.Request.Path,
            };

            httpContext.Response.StatusCode = statusCode;
            await httpContext.Response.WriteAsJsonAsync(
                problemDetails,
                options: null,
                contentType: ProblemDetailsContentType,
                cancellationToken: cancellationToken
            );

            return true;
        }
    }
}
