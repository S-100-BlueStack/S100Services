using ArcGIS.Core.Data;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Startup;
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
            S128ConnectionPrerequisite connection;
            try {
                connection = ProductCatalogueStartupPrerequisites.ValidateS128Connection(
                    configuration.GetSection("Connections")["S128Connection"]
                );
            }
            catch (Exception ex) {
                Log.Error(
                    ex,
                    "Product Catalogue startup prerequisite validation failed. Prerequisite: {Prerequisite}",
                    "S128Configuration"
                );
                throw ProductCatalogueStartupException.S128ConfigurationInvalid();
            }

            try {
                ArcGIS.Core.Hosting.Host.Initialize(ArcGIS.Core.Hosting.Host.LicenseProductCode.ArcGISPro);
                Log.Information("ArcGIS Core Host Initialized");
                Log.Information("Connecting to configured S128-Database");

                var productManager = await S100FC.ProductCatalogue.ProductManagerGDB.CreateInstanceAsync(() => {
                    return connection.ConnectionType switch {
                        S128ConnectionType.EnterpriseGeodatabase => new Geodatabase(
                            new DatabaseConnectionFile(new Uri(connection.Path))
                        ),
                        S128ConnectionType.FileGeodatabase => new Geodatabase(
                            new FileGeodatabaseConnectionPath(new Uri(connection.Path))
                        ),
                        _ => throw new InvalidOperationException("Unsupported S-128 connection type.")
                    };
                });

                services.AddSingleton(productManager);
            }
            catch (Exception ex) {
                Log.Error(
                    ex,
                    "Required Product Catalogue initialization failed. Prerequisite: {Prerequisite}",
                    "ArcGISProductManager"
                );
                throw ProductCatalogueStartupException.ProductManagerInitializationFailed();
            }

            services.AddSingleton<Microsoft.Extensions.Options.IValidateOptions<SendToIcEncOptions>, SendToIcEncOptionsValidator>();
            services
                .AddOptions<SendToIcEncOptions>()
                .Bind(configuration.GetSection(SendToIcEncOptions.SectionName))
                .ValidateOnStart();
            services.AddSingleton<ISendToIcEncJobService, HangfireSendToIcEncJobService>();
            services.AddTransient<UploadSingularProductJob>();
        }
    }
}
