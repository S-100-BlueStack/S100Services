using IO = System.IO;

namespace DataCatalague.Api.Configuration
{
    public class PackagesOptions
    {
        public const string SectionName = "Packages";

        public string Archive { get; init; } = string.Empty;

        public long MaxFileSize { get; init; }

        public long MaxExtractedSize { get; init; }

        public string Geodatabase { get; init; } = string.Empty;
    }

    public static class PackagesConfiguration
    {
        public static IServiceCollection AddPackageConfiguration(
                this IServiceCollection services,
                IConfiguration configuration) {
            services
                .AddOptions<PackagesOptions>()
                .Bind(configuration.GetSection(PackagesOptions.SectionName))
                .Validate(options => IO.Directory.Exists(options.Archive), "Archive folder not found!")
                .Validate(options => !string.IsNullOrEmpty(options.Geodatabase), "Geodatabase not found!")
                .ValidateOnStart();
            return services;
        }
    }
}
