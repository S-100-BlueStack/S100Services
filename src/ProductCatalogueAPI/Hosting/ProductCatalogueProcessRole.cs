namespace ProductCatalogueAPI.Hosting;

/// <summary>
/// Defines the mutually exclusive runtime roles supported by the Product Catalogue executable.
/// </summary>
public enum ProductCatalogueProcessRole
{
    Api,
    Worker
}

/// <summary>
/// Centralizes the isolation contract so the API can never host background ArcGIS execution.
/// </summary>
public sealed class ProductCatalogueProcessProfile
{
    public const string InteractiveArcGisExecutionLane = "Interactive";
    public const string BackgroundArcGisExecutionLane = "Background";

    private ProductCatalogueProcessProfile(
        ProductCatalogueProcessRole role,
        string arcGisExecutionLane,
        bool runsHttpServer,
        bool runsHangfireServer,
        int hangfireWorkerCount
    ) {
        Role = role;
        ArcGisExecutionLane = arcGisExecutionLane;
        RunsHttpServer = runsHttpServer;
        RunsHangfireServer = runsHangfireServer;
        HangfireWorkerCount = hangfireWorkerCount;
    }

    public ProductCatalogueProcessRole Role { get; }
    public string ArcGisExecutionLane { get; }
    public bool RunsHttpServer { get; }
    public bool RunsHangfireServer { get; }
    public int HangfireWorkerCount { get; }

    public static ProductCatalogueProcessProfile For(ProductCatalogueProcessRole role) => role switch
    {
        ProductCatalogueProcessRole.Api => new(
            role,
            InteractiveArcGisExecutionLane,
            runsHttpServer: true,
            runsHangfireServer: false,
            hangfireWorkerCount: 0
        ),
        ProductCatalogueProcessRole.Worker => new(
            role,
            BackgroundArcGisExecutionLane,
            runsHttpServer: false,
            runsHangfireServer: true,
            hangfireWorkerCount: 1
        ),
        _ => throw new ArgumentOutOfRangeException(nameof(role), role, null)
    };
}

/// <summary>
/// Resolves the process role before either the HTTP host or the worker host is created.
/// </summary>
public static class ProductCatalogueProcessRoleResolver
{
    public const string ConfigurationKey = "ProductCatalogue:ProcessRole";
    public const string EnvironmentVariable = "ProductCatalogue__ProcessRole";

    public static ProductCatalogueProcessRole Resolve(
        IReadOnlyList<string> args,
        string? environmentValue = null
    ) {
        var commandLineValue = ReadCommandLineValue(args);
        return Parse(commandLineValue ?? environmentValue);
    }

    public static ProductCatalogueProcessRole Parse(string? value) {
        if (string.IsNullOrWhiteSpace(value))
            return ProductCatalogueProcessRole.Api;

        if (Enum.TryParse<ProductCatalogueProcessRole>(value.Trim(), ignoreCase: true, out var role))
            return role;

        throw new InvalidOperationException(
            $"{ConfigurationKey} must be Api or Worker."
        );
    }

    private static string? ReadCommandLineValue(IReadOnlyList<string> args) {
        var optionName = $"--{ConfigurationKey}";

        for (var index = 0; index < args.Count; index++) {
            var argument = args[index];
            if (argument.StartsWith($"{optionName}=", StringComparison.OrdinalIgnoreCase))
                return argument[(optionName.Length + 1)..];

            if (string.Equals(argument, optionName, StringComparison.OrdinalIgnoreCase)) {
                if (index + 1 >= args.Count)
                    throw new InvalidOperationException($"{optionName} requires a value.");

                return args[index + 1];
            }
        }

        return null;
    }
}
