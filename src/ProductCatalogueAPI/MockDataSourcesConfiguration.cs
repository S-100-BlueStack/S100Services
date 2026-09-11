namespace ProductCatalogueAPI
{
    internal static class MockDataSourcesConfiguration
    {
        public const string EnabledKey = "MockDataSources:Enabled";

        public static bool IsEnabled(IConfiguration configuration, bool isDevelopment) {
            ArgumentNullException.ThrowIfNull(configuration);

            if (isDevelopment)
                return true;

            return bool.TryParse(configuration[EnabledKey], out var enabled) && enabled;
        }
    }
}
