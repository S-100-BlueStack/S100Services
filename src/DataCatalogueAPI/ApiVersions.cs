using Asp.Versioning;

namespace OpenApiDemo.Api.Configuration;

/// <summary>
/// Single source of truth for the API versions exposed by this service.
/// </summary>
/// <remarks>
/// Adding a new version means adding a constant here, appending its document name to
/// <see cref="DocumentNames"/>, and creating the matching controllers. Everything else
/// (OpenAPI documents, Swagger UI entries and the Scalar version picker) follows.
/// </remarks>
public static class ApiVersions
{
    /// <summary>The literal used by <see cref="ApiVersionAttribute"/> for version 1.0.</summary>
    public const string V1Text = "1.0";

    /// <summary>The literal used by <see cref="ApiVersionAttribute"/> for version 2.0.</summary>
    public const string V2Text = "2.0";

    /// <summary>Version 1.0 of the API. Deprecated, but still served.</summary>
    public static readonly ApiVersion V1 = new(1, 0);

    /// <summary>Version 2.0 of the API. The current version.</summary>
    public static readonly ApiVersion V2 = new(2, 0);

    /// <summary>
    /// The OpenAPI document names, ordered oldest first. These must match the group
    /// names produced by the API explorer's <c>GroupNameFormat</c> of <c>'v'VVV</c>.
    /// </summary>
    public static IReadOnlyList<string> DocumentNames { get; } = ["v1", "v2"];
}
