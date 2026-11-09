using Microsoft.AspNetCore.Mvc.Filters;
using System.Diagnostics;

namespace DataCatalague.Api.Diagnostics;

/// <summary>Times MVC result execution, including JSON serialization and response writing.</summary>
public sealed class WorkspacePackagesResultTimingFilter(ILogger<WorkspacePackagesResultTimingFilter> logger) : IAsyncResultFilter
{
    public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next) {
        var started = Stopwatch.GetTimestamp();
        var completed = await next();
        // Result execution also includes response writing; it is not a pure serializer benchmark.
        logger.LogInformation(
            "Workspace packages result executed. PipelineId: {PipelineId}, WorkspaceId: {WorkspaceId}, ResultExecutionMs: {ResultExecutionMs}, Canceled: {Canceled}.",
            context.RouteData.Values["id"]?.ToString(), context.RouteData.Values["workspace"]?.ToString(),
            Stopwatch.GetElapsedTime(started).TotalMilliseconds, completed.Canceled);
    }
}
