using IO = System.IO;

namespace DataCatalague.Api.Configuration
{
    public class DispatcherOptions
    {
        public const string SectionName = "Dispatcher";

        public string Geodatabase { get; init; } = string.Empty;
    }

    public static class DispatchConfiguration
    {
        public static IServiceCollection AddDispatcherConfiguration(
                this IServiceCollection services,
                IConfiguration configuration) {
            services
                .AddOptions<DispatcherOptions>()
                .Bind(configuration.GetSection(DispatcherOptions.SectionName))
                .Validate(options => !string.IsNullOrEmpty(options.Geodatabase), "Geodatabase not found!")
                .ValidateOnStart();

            return services;
        }
    }
}
