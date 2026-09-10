namespace ProductCatalogueAPI.Startup
{
    internal enum S128ConnectionType
    {
        EnterpriseGeodatabase,
        FileGeodatabase
    }

    internal sealed record S128ConnectionPrerequisite(
        string Path,
        S128ConnectionType ConnectionType
    );

    internal enum ProductCatalogueStartupFailureCategory
    {
        S128Configuration,
        ArcGisProductManagerInitialization
    }

    internal sealed class ProductCatalogueStartupException(
        ProductCatalogueStartupFailureCategory category,
        string code,
        string message
    ) : InvalidOperationException($"{code}: {message}")
    {
        public ProductCatalogueStartupFailureCategory Category { get; } = category;
        public string Code { get; } = code;

        public static ProductCatalogueStartupException S128ConfigurationInvalid() => new(
            ProductCatalogueStartupFailureCategory.S128Configuration,
            "S128_CONFIGURATION_INVALID",
            "Required S-128 configuration is invalid."
        );

        public static ProductCatalogueStartupException ProductManagerInitializationFailed() => new(
            ProductCatalogueStartupFailureCategory.ArcGisProductManagerInitialization,
            "PRODUCT_MANAGER_INITIALIZATION_FAILED",
            "Required ArcGIS/ProductManager initialization failed."
        );
    }

    internal static class ProductCatalogueStartupPrerequisites
    {
        public static S128ConnectionPrerequisite ValidateS128Connection(string? configuredPath) {
            if (string.IsNullOrWhiteSpace(configuredPath))
                throw new InvalidOperationException("Connections:S128Connection is required.");

            string fullPath;
            try {
                fullPath = System.IO.Path.GetFullPath(configuredPath.Trim());
            }
            catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException) {
                throw new InvalidOperationException("Connections:S128Connection is not a valid filesystem path.", ex);
            }

            var extension = System.IO.Path.GetExtension(fullPath);
            var connectionType = extension.ToLowerInvariant() switch {
                ".sde" => S128ConnectionType.EnterpriseGeodatabase,
                ".gdb" => S128ConnectionType.FileGeodatabase,
                _ => throw new InvalidOperationException(
                    "Connections:S128Connection must reference a .sde file or .gdb directory."
                )
            };

            var exists = connectionType switch {
                S128ConnectionType.EnterpriseGeodatabase => File.Exists(fullPath),
                S128ConnectionType.FileGeodatabase => Directory.Exists(fullPath),
                _ => false
            };

            if (!exists)
                throw new InvalidOperationException(
                    "The configured S-128 connection path is unavailable to the application."
                );

            return new S128ConnectionPrerequisite(fullPath, connectionType);
        }
    }
}
