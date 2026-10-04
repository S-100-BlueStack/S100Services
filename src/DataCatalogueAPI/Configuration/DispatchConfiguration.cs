using IO = System.IO;

namespace DataCatalague.Api.Configuration
{
    public class DispatcherOptions
    {
        public const string SectionName = "Dispatcher";

        public string Archive { get; init; } = string.Empty;

        public long MaxFileSize { get; init; }

        public long MaxExtractedSize { get; init; }

        public string Geodatabase { get; init; } = string.Empty;
    }

    public static class DispatchConfiguration
    {
        public static IServiceCollection AddStreamConfiguration(
                this IServiceCollection services,
                IConfiguration configuration) {
            services
                .AddOptions<DispatcherOptions>()
                .Bind(configuration.GetSection(DispatcherOptions.SectionName))
                .Validate(options => IO.Directory.Exists(options.Archive), "Archive folder not found!")
                .Validate(options => !string.IsNullOrEmpty(options.Geodatabase), "Geodatabase not found!")
                .ValidateOnStart();

            return services;
        }

        public static IServiceCollection AddPackageConfiguration(
                this IServiceCollection services,
                IConfiguration configuration) {
            return services;
        }
    }
}
