using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.Services.ValidationEmail;
using Xunit;

namespace TestProductCatalogue;

/// <summary>Protects mailbox/report content and live operator credentials from the global mutation audit filter.</summary>
public sealed class ValidationEmailAuditTests
{
    /// <summary>Replay messages, review explanations and operator keys produce only redacted audit metadata.</summary>
    [Fact]
    public async Task SensitiveEvidenceNeverEntersMutationLog() {
        var logger = new Logger();
        var http = new DefaultHttpContext();
        http.Request.Method = "POST";
        var action = new ActionContext(http, new RouteData(), new ControllerActionDescriptor { ActionName = "Replay" }, new ModelStateDictionary());
        var arguments = new Dictionary<string, object?> {
            ["operatorKey"] = "secret-operator-value",
            ["message"] = new ValidationEmailMessage("id", null, "private@example.invalid", DateTimeOffset.UtcNow, "private-subject", "private-body", []),
            ["review"] = new ValidationEmailReview(Guid.NewGuid(), "private-explanation")
        };
        var context = new ActionExecutingContext(action, [], arguments, new object());
        await new MutationAuditLogFilter(logger).OnActionExecutionAsync(context, () => Task.FromResult(new ActionExecutedContext(action, [], context.Controller)));
        var message = Assert.Single(logger.Messages);
        Assert.Contains("[REDACTED]", message);
        Assert.DoesNotContain("secret-operator-value", message);
        Assert.DoesNotContain("private-", message);
        Assert.DoesNotContain("private@example.invalid", message);
    }
    private sealed class Logger : ILogger<MutationAuditLogFilter>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => Messages.Add(formatter(state, exception));
    }
}
