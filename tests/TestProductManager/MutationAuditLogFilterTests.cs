using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using ProductCatalogueAPI.Filters;

namespace TestProductCatalogueAPI;

public sealed class MutationAuditLogFilterTests
{
    [Fact]
    public async Task PostLogsFunctionArgumentsAndUsernameOnOneLine() {
        var logger = new RecordingLogger<MutationAuditLogFilter>();
        var filter = new MutationAuditLogFilter(logger);
        var context = CreateContext(HttpMethods.Post, new Dictionary<string, object?> {
            ["datasetName"] = "101DK001",
            ["request"] = new AuditRequest("new edition", "do-not-log"),
            ["cancellationToken"] = CancellationToken.None
        });

        await filter.OnActionExecutionAsync(context, Next(context));

        var message = Assert.Single(logger.Messages);
        Assert.Contains("Function called by user: ExportEdition(", message);
        Assert.Contains("datasetName=\"101DK001\"", message);
        Assert.Contains("Description=\"new edition\"", message);
        Assert.Contains("Password=[REDACTED]", message);
        Assert.DoesNotContain("do-not-log", message);
        Assert.DoesNotContain("cancellationToken", message);
        Assert.EndsWith(") [DOMAIN\\developer]", message);
        Assert.DoesNotContain("\n", message);
    }

    [Fact]
    public async Task GetDoesNotWriteMutationAuditLog() {
        var logger = new RecordingLogger<MutationAuditLogFilter>();
        var filter = new MutationAuditLogFilter(logger);
        var context = CreateContext(HttpMethods.Get, new Dictionary<string, object?>());

        await filter.OnActionExecutionAsync(context, Next(context));

        Assert.Empty(logger.Messages);
    }

    private static ActionExecutingContext CreateContext(string method, IDictionary<string, object?> arguments) {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Method = method;
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, "DOMAIN\\developer") }, "test"));
        var actionContext = new ActionContext(httpContext, new RouteData(), new ControllerActionDescriptor { ActionName = "ExportEdition" }, new ModelStateDictionary());
        return new ActionExecutingContext(actionContext, new List<IFilterMetadata>(), new Dictionary<string, object?>(arguments), new object());
    }

    private static ActionExecutionDelegate Next(ActionExecutingContext context) => () => Task.FromResult(new ActionExecutedContext(context, new List<IFilterMetadata>(), context.Controller));

    private sealed record AuditRequest(string Description, string Password);

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => Messages.Add(formatter(state, exception));
    }
}
