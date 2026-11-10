using Microsoft.AspNetCore.Diagnostics;

namespace DataCatalague.Api.Configuration;

/// <summary>Separates abandoned HTTP requests from real application failures.</summary>
public sealed class ClientCancellationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context) {
        try {
            await next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) {
            // The client is gone: no status-code page or error payload can usefully be sent.
            // Mark the request before control returns to the outer Serilog request logger.
            if (context.Features.Get<IStatusCodePagesFeature>() is { } statusCodePages) {
                statusCodePages.Enabled = false;
            }
            if (!context.Response.HasStarted) {
                context.Response.StatusCode = StatusCodes.Status499ClientClosedRequest;
            }
        }
    }
}
