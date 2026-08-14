using System.Collections;
using System.Globalization;
using System.Reflection;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ProductCatalogueAPI.Filters;

public sealed class MutationAuditLogFilter(ILogger<MutationAuditLogFilter> logger) : IAsyncActionFilter
{
    private static readonly string[] SensitiveTerms = ["password", "secret", "token", "authorization", "credential"];
    private readonly ILogger<MutationAuditLogFilter> _logger = logger;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next) {
        var method = context.HttpContext.Request.Method;
        if (HttpMethods.IsPost(method) || HttpMethods.IsPut(method) || HttpMethods.IsDelete(method)) {
            var function = (context.ActionDescriptor as ControllerActionDescriptor)?.ActionName;
            if (string.IsNullOrWhiteSpace(function))
                function = context.ActionDescriptor.DisplayName ?? "UnknownAction";
            var arguments = string.Join(", ", context.ActionArguments
                .Where(argument => argument.Value is not CancellationToken)
                .Select(argument => $"{argument.Key}={FormatValue(argument.Key, argument.Value)}"));
            var user = context.HttpContext.User?.Identity?.Name ?? string.Empty;

            _logger.LogInformation("Function called by user: {Function}({Arguments}) [{User}]", function, arguments, user);
        }

        await next();
    }

    private static string FormatValue(string name, object? value, int depth = 0) {
        if (IsSensitive(name)) return "[REDACTED]";
        if (value is null) return "null";
        if (value is string text) return Quote(Truncate(text));
        if (value is byte[] bytes) return $"<{bytes.Length} bytes>";
        if (value is Stream) return $"<{value.GetType().Name}>";
        if (value is IFormFile file) return $"<file name={Quote(file.FileName)}, length={file.Length}>";
        if (value is DateTime or DateTimeOffset or Guid or Enum || value.GetType().IsPrimitive || value is decimal)
            return Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
        if (depth >= 2) return $"<{value.GetType().Name}>";
        if (value is IEnumerable enumerable) return FormatEnumerable(enumerable, depth + 1);

        var properties = value.GetType()
            .GetProperties(BindingFlags.Instance | BindingFlags.Public)
            .Where(property => property.CanRead && property.GetIndexParameters().Length == 0)
            .Take(20)
            .Select(property => $"{property.Name}={ReadProperty(property, value, depth + 1)}");

        return $"{{{string.Join(", ", properties)}}}";
    }

    private static string ReadProperty(PropertyInfo property, object instance, int depth) {
        if (IsSensitive(property.Name)) return "[REDACTED]";

        try {
            return FormatValue(property.Name, property.GetValue(instance), depth);
        }
        catch {
            return "<unavailable>";
        }
    }

    private static string FormatEnumerable(IEnumerable values, int depth) {
        var formatted = new List<string>();
        foreach (var value in values) {
            if (formatted.Count == 20) {
                formatted.Add("...");
                break;
            }

            formatted.Add(FormatValue("item", value, depth));
        }

        return $"[{string.Join(", ", formatted)}]";
    }

    private static bool IsSensitive(string name) => SensitiveTerms.Any(term => name.Contains(term, StringComparison.OrdinalIgnoreCase));

    private static string Quote(string value) => $"\"{value.Replace("\r", " ").Replace("\n", " ")}\"";

    private static string Truncate(string value) => value.Length <= 256 ? value : $"{value[..256]}...";
}
