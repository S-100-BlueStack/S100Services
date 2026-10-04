using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>Represents validated export-target parsing.</summary>
public sealed record ExportTargetValidationResult(ProductSpecification? Target, ProblemDetails? ProblemDetails)
{
    /// <summary>Gets whether a target was parsed and is currently implemented.</summary>
    public bool IsValid => Target.HasValue && ProblemDetails is null;
}

/// <summary>Defines the public product-specific export target contract.</summary>
public static class ExportTargetContract
{
    public const string QueryParameterName = "exportTarget";
    public const string DefaultTarget = "S101";
    public const string InvalidTargetCode = "EXPORT_TARGET_INVALID";
    public const string UnsupportedTargetCode = "EXPORT_TARGET_NOT_IMPLEMENTED";
    public static IReadOnlyList<string> AllowedTargets { get; } = Array.AsReadOnly(new[] { "S57", "S101", "S102", "S122" });
    public static IReadOnlyList<string> SupportedTargets { get; } = Array.AsReadOnly(new[] { "S57", "S101" });
    private static readonly object ValidatedTargetItemKey = new();

    /// <summary>Parses a case-insensitive product target and rejects scaffold-only engines.</summary>
    public static ExportTargetValidationResult ParseAndValidate(string? value) {
        var normalized = value ?? DefaultTarget;
        var canonical = AllowedTargets.SingleOrDefault(candidate => string.Equals(candidate, normalized, StringComparison.OrdinalIgnoreCase));
        if (canonical is null || !Enum.TryParse<ProductSpecification>(canonical, ignoreCase: false, out var target))
            return Invalid(value);
        if (!SupportedTargets.Contains(target.ToString(), StringComparer.Ordinal))
            return Unsupported(target);
        return new ExportTargetValidationResult(target, null);
    }

    /// <summary>Stores the validated target for the controller action.</summary>
    public static void SetValidatedTarget(HttpContext httpContext, ProductSpecification target) => httpContext.Items[ValidatedTargetItemKey] = target;

    /// <summary>Gets the target stored by <see cref="Filters.ValidateExportTargetAttribute"/>.</summary>
    public static ProductSpecification GetValidatedTarget(HttpContext httpContext) => httpContext.Items.TryGetValue(ValidatedTargetItemKey, out var value) && value is ProductSpecification target
        ? target
        : throw new InvalidOperationException("The export target must be validated before the export action runs.");

    private static ExportTargetValidationResult Invalid(string? value) {
        var problem = new ProblemDetails { Title = "Export target is invalid", Status = StatusCodes.Status400BadRequest, Detail = $"The export target '{value ?? "<missing>"}' is invalid. Use S57, S101, S102, or S122." };
        problem.Extensions["code"] = InvalidTargetCode;
        problem.Extensions["allowedTargets"] = AllowedTargets.ToArray();
        return new ExportTargetValidationResult(null, problem);
    }

    private static ExportTargetValidationResult Unsupported(ProductSpecification target) {
        var problem = new ProblemDetails { Title = "Export target is not implemented", Status = StatusCodes.Status422UnprocessableEntity, Detail = $"The {target} engine boundary exists, but its encoder is not implemented." };
        problem.Extensions["code"] = UnsupportedTargetCode;
        problem.Extensions["supportedTargets"] = SupportedTargets.ToArray();
        return new ExportTargetValidationResult(null, problem);
    }
}
