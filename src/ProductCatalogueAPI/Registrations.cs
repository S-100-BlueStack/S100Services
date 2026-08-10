using ArcGIS.Core.Data;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Jobs;
using Serilog;

namespace ProductCatalogueAPI
{
    /// <summary>
    /// Registers Product Catalogue API services that depend on ArcGIS Core and the S-128 geodatabase.
    /// </summary>
    public static class Registrations
    {
        /// <summary>
        /// Initializes ArcGIS Core, creates the core product manager, and registers Product Catalogue job services.
        /// </summary>
        /// <param name="services">The service collection that receives the Product Catalogue registrations.</param>
        /// <param name="configuration">The application configuration containing the S-128 connection settings.</param>
        /// <returns>A task that completes after the ArcGIS-backed product manager has been initialized.</returns>
        public static async Task AddS100ProductCatalogue(this IServiceCollection services, ConfigurationManager configuration) {
            services.AddSingleton<Microsoft.Extensions.Options.IValidateOptions<SendToIcEncOptions>, SendToIcEncOptionsValidator>();
            services
                .AddOptions<SendToIcEncOptions>()
                .Bind(configuration.GetSection(SendToIcEncOptions.SectionName))
                .ValidateOnStart();
            services.AddSingleton<ISendToIcEncJobService, HangfireSendToIcEncJobService>();
            services.AddTransient<UploadSingularProductJob>();

            try {
                // Set up ArcGIS and ProductCatalogue services
                ArcGIS.Core.Hosting.Host.Initialize(ArcGIS.Core.Hosting.Host.LicenseProductCode.ArcGISPro);
                Log.Information("ArcGIS Core Host Initialized");
                // Connect to gdb/sde
                var path = configuration.GetSection("Connections")["S128Connection"];

                if (string.IsNullOrWhiteSpace(path) || !Path.Exists(path))
                    throw new InvalidOperationException($"S128:ConnectionFile is either not configured or the system has insufficient access to the file: {path}");

                Log.Information("Connecting to S128-Database: {path}", path);
                var productManager = await S100FC.ProductCatalogue.ProductManagerGDB.CreateInstanceAsync(() => {
                    if (".sde".Equals(System.IO.Path.GetExtension(path), StringComparison.OrdinalIgnoreCase)) {
                        var connectionFile = new DatabaseConnectionFile(new Uri(System.IO.Path.GetFullPath(path)));

                        return new Geodatabase(connectionFile);
                    }
                    else if (".gdb".Equals(System.IO.Path.GetExtension(path), StringComparison.OrdinalIgnoreCase)) {
                        var connectionFile = new FileGeodatabaseConnectionPath(new Uri(Path.GetFullPath(path)));
                        return new Geodatabase(connectionFile);
                    }
                    else {
                        throw new InvalidOperationException("Connectionfile path for S128-Database is neither .gdb nor .sde");
                    }
                });

                services.AddSingleton(productManager);
            }
            catch (Exception ex) {
                Log.Error("Exception occured during init. {ex}", ex);
            }
        }
    }
}
