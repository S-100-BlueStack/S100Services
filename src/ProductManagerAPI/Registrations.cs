using ArcGIS.Core.Data;
using Serilog;

namespace ProductManagerAPI
{
    public static class Registrations
    {
        public static async Task AddS100ProductManager(this IServiceCollection services, ConfigurationManager configuration) {
            try {
                // Setup ArcGIS and ProductManager
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