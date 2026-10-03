using IO = System.IO;

namespace DataCatalague.Api.Configuration
{
    public class LuggageOptions
    {
        public const string SectionName = "Luggage";

        public string Archive { get; init; } = string.Empty;

        public long MaxFileSize { get; init; }

        public long MaxExtractedSize { get; init; }        
    }

    public static class LuggageConfiguration {
        public static IServiceCollection AddLuggagefiguration(
                this IServiceCollection services,
                IConfiguration configuration) {
            services
                .AddOptions<LuggageOptions>()
                .Bind(configuration.GetSection(LuggageOptions.SectionName))
                .Validate(options => IO.Directory.Exists(options.Archive), "Archive folder not found!")
                .ValidateOnStart();

            return services;
        }
    }
}
