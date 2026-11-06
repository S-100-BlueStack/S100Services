using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ProductCatalogueAPI;
using ProductCatalogueAPI.Hosting;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.History;

namespace TestProductCatalogueAPI;

public sealed class ProductHistoryHostingTests
{
    [Theory]
    [InlineData(ProductCatalogueProcessRole.Api, 0)]
    [InlineData(ProductCatalogueProcessRole.Worker, 1)]
    public void ReconciliationHasOneWorkerOwnerAndNoApiRegistration(ProductCatalogueProcessRole role, int count) {
        var services = new ServiceCollection();
        var profile = ProductCatalogueProcessProfile.For(role);
        var register = typeof(BackendRegistrations).GetMethod("AddProductCatalogueExportExecution", BindingFlags.NonPublic | BindingFlags.Static)!;
        register.Invoke(null, [services, new ConfigurationBuilder().Build(), profile]);
        Assert.Equal(count, services.Count(descriptor => descriptor.ServiceType == typeof(IHostedService) &&
            descriptor.ImplementationType == typeof(ProductHistoryReconciliationRegistration)));
        Assert.Equal(count, services.Count(descriptor => descriptor.ServiceType == typeof(ProductHistoryReconciliationJob)));
        Assert.Equal(count, services.Count(descriptor => descriptor.ServiceType == typeof(IProductExportHistory)));
        Assert.Equal(count, profile.HangfireWorkerCount);
    }
}
