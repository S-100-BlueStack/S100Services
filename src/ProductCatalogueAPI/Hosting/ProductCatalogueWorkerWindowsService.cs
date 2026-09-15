using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ProductCatalogueAPI.Hosting;

/// <summary>
/// Configures the isolated background process to cooperate with the Windows Service Control Manager.
/// </summary>
public static class ProductCatalogueWorkerWindowsService
{
    public const string ServiceName = "ProductCatalogueWorker";
    public const string DisplayName = "Product Catalogue Worker";

    /// <summary>
    /// Adds Windows Service lifetime support for the worker host.
    /// The framework extension is context-aware, so console-hosted development runs remain unchanged.
    /// </summary>
    public static IServiceCollection AddProductCatalogueWorkerWindowsService(
        this IServiceCollection services
    ) {
        ArgumentNullException.ThrowIfNull(services);

        services.AddWindowsService(options => {
            options.ServiceName = ServiceName;
        });

        return services;
    }
}
