using Microsoft.AspNetCore.Mvc;
using static ProductCatalogueAPI.Models.RequestTypes;

namespace ProductCatalogueAPI.Services.Export
{
    public sealed record ExportTargetValidationResult(ExportFormat? Target, ProblemDetails? ProblemDetails)
    {
        public bool IsValid => Target.HasValue && ProblemDetails == null;
    }

    public static class ExportTargetContract
    {
        public const string QueryParameterName = "exportTarget";
        public const string DefaultTarget = "S100";
        public const string InvalidTargetCode = "EXPORT_TARGET_INVALID";
        public const string UnsupportedTargetCode = "EXPORT_TARGET_NOT_SUPPORTED";

        public static IReadOnlyList<string> AllowedTargets { get; } = Array.AsReadOnly(new[] {
            "All",
            "S100",
            "S57"
        });

        public static IReadOnlyList<string> SupportedTargets { get; } = Array.AsReadOnly(new[] {
            "S100"
        });

        private static readonly object ValidatedTargetItemKey = new();

        public static ExportTargetValidationResult ParseAndValidate(string? value) {
            if (value == null || string.Equals(value, DefaultTarget, StringComparison.OrdinalIgnoreCase)) {
                return new ExportTargetValidationResult(ExportFormat.S100, null);
            }

            if (string.IsNullOrWhiteSpace(value)) {
                return Invalid(value);
            }

            if (string.Equals(value, "All", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "S57", StringComparison.OrdinalIgnoreCase)) {
                return Unsupported(value);
            }

            // This also rejects the legacy enum name Both, numeric values and
            // numeric-looking values before ASP.NET enum model binding can accept them.
            return Invalid(value);
        }

        public static void SetValidatedTarget(HttpContext httpContext, ExportFormat target) {
            if (target != ExportFormat.S100) {
                throw new ArgumentOutOfRangeException(nameof(target), target, "Only S100 is currently supported.");
            }

            httpContext.Items[ValidatedTargetItemKey] = target;
        }

        public static ExportFormat GetValidatedTarget(HttpContext httpContext) {
            if (httpContext.Items.TryGetValue(ValidatedTargetItemKey, out var value) &&
                value is ExportFormat target) {
                return target;
            }

            throw new InvalidOperationException("The export target must be validated before the export action runs.");
        }

        private static ExportTargetValidationResult Invalid(string? value) {
            var displayValue = value == null ? "<missing>" : value;
            var problemDetails = new ProblemDetails {
                Title = "Export target is invalid",
                Status = StatusCodes.Status400BadRequest,
                Detail = $"The export target '{displayValue}' is invalid. Use All, S100, or S57."
            };

            problemDetails.Extensions["code"] = InvalidTargetCode;
            problemDetails.Extensions["allowedTargets"] = AllowedTargets.ToArray();

            return new ExportTargetValidationResult(null, problemDetails);
        }

        private static ExportTargetValidationResult Unsupported(string value) {
            var problemDetails = new ProblemDetails {
                Title = "Export target is not supported",
                Status = StatusCodes.Status422UnprocessableEntity,
                Detail = $"The export target '{value}' is valid, but only S100 exports are currently available."
            };

            problemDetails.Extensions["code"] = UnsupportedTargetCode;
            problemDetails.Extensions["supportedTargets"] = SupportedTargets.ToArray();

            return new ExportTargetValidationResult(null, problemDetails);
        }
    }
}
