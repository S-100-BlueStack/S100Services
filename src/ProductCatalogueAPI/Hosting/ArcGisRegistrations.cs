using ArcGIS.Core.Data;
using ProductCatalogueAPI.Startup;
using Serilog;

namespace ProductCatalogueAPI.Hosting
{
    /// <summary>
    /// Registers Product Catalogue API services that depend on ArcGIS Core and the S-128 geodatabase.
    /// </summary>
    public static class ArcGisRegistrations
    {
        /// <summary>
        /// Initializes ArcGIS Core and registers the core product manager for one host process.
        /// </summary>
        /// <param name="services">The service collection that receives the Product Catalogue registrations.</param>
        /// <param name="configuration">The application configuration containing the S-128 connection settings.</param>
        /// <param name="executionLane">The diagnostic name of the process-owned ArcGIS execution lane.</param>
        /// <returns>A task that completes after the ArcGIS-backed product manager has been initialized.</returns>
        public static async Task AddS100ProductCatalogue(
            this IServiceCollection services,
            ConfigurationManager configuration,
            string executionLane = ProductCatalogueProcessProfile.InteractiveArcGisExecutionLane
        ) {
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
                }, executionLane);

                services.AddSingleton(productManager);
                Log.Information(
                    "ArcGIS Product Manager initialized. ArcGisExecutionLane: {ArcGisExecutionLane}. ProcessId: {ProcessId}",
                    executionLane,
                    Environment.ProcessId
                );
            }
            catch (Exception ex) {
                Log.Error(
                    ex,
                    "Required Product Catalogue initialization failed. Prerequisite: {Prerequisite}",
                    "ArcGISProductManager"
                );
                throw ProductCatalogueStartupException.ProductManagerInitializationFailed();
            }
        }
    }
}
