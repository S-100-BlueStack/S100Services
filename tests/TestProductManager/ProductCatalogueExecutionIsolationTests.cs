using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ProductCatalogueAPI;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Hosting;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class ProductCatalogueExecutionIsolationTests
{
    [Fact]
    public void ApiAndWorkerProfilesCannotShareAnArcGisExecutionLane() {
        var api = ProductCatalogueProcessProfile.For(ProductCatalogueProcessRole.Api);
        var worker = ProductCatalogueProcessProfile.For(ProductCatalogueProcessRole.Worker);

        Assert.True(api.RunsHttpServer);
        Assert.False(api.RunsHangfireServer);
        Assert.False(worker.RunsHttpServer);
        Assert.True(worker.RunsHangfireServer);
        Assert.NotEqual(api.ArcGisExecutionLane, worker.ArcGisExecutionLane);
    }

    [Fact]
    public void InteractiveApiProcessDoesNotRegisterAHangfireServer() {
        var services = new ServiceCollection();

        services.AddProductCatalogueHangfireServer(
            ProductCatalogueProcessProfile.For(ProductCatalogueProcessRole.Api)
        );

        Assert.DoesNotContain(
            services,
            descriptor => descriptor.ServiceType == typeof(IHostedService)
        );
    }

    [Fact]
    public void BackgroundProcessRegistersOneSerializedHangfireWorker() {
        var services = new ServiceCollection();
        var worker = ProductCatalogueProcessProfile.For(ProductCatalogueProcessRole.Worker);

        services.AddProductCatalogueHangfireServer(worker);

        Assert.Equal(1, worker.HangfireWorkerCount);
        Assert.Contains(
            services,
            descriptor => descriptor.ServiceType == typeof(IHostedService)
        );
    }

    [Fact]
    public void ExportExecutionServicesExistOnlyInTheBackgroundProcess() {
        var apiServices = new ServiceCollection();
        var workerServices = new ServiceCollection();
        var configuration = new ConfigurationManager();
        configuration["ArtifactsPath"] = "artifacts";

        apiServices.AddProductCatalogueExportExecution(
            configuration,
            ProductCatalogueProcessProfile.For(ProductCatalogueProcessRole.Api)
        );
        workerServices.AddProductCatalogueExportExecution(
            configuration,
            ProductCatalogueProcessProfile.For(ProductCatalogueProcessRole.Worker)
        );

        Assert.DoesNotContain(
            apiServices,
            descriptor => descriptor.ServiceType == typeof(IExportOperationService)
        );
        Assert.Contains(
            workerServices,
            descriptor => descriptor.ServiceType == typeof(IExportOperationService)
        );
        Assert.Contains(
            workerServices,
            descriptor => descriptor.ServiceType == typeof(ExportOperationJob)
        );
    }

    [Fact]
    public void InteractiveAndBackgroundArcGisConsumersRequireProductManagerFromTheirOwnProcess() {
        AssertConstructorConsumesProductManager(typeof(ElectronicProductsController));
        AssertConstructorConsumesProductManager(typeof(ExportController));
        AssertConstructorConsumesProductManager(typeof(ExportOperationJob));
        AssertConstructorConsumesProductManager(typeof(ExportOperationService));
        AssertConstructorConsumesProductManager(typeof(DetectProductChangesJob));
    }

    [Theory]
    [InlineData(null, ProductCatalogueProcessRole.Api)]
    [InlineData("api", ProductCatalogueProcessRole.Api)]
    [InlineData("WORKER", ProductCatalogueProcessRole.Worker)]
    public void ProcessRoleIsExplicitAndDefaultsToApi(
        string? value,
        ProductCatalogueProcessRole expected
    ) {
        Assert.Equal(expected, ProductCatalogueProcessRoleResolver.Parse(value));
    }

    [Fact]
    public void UnsupportedCombinedProcessRoleFailsClosed() {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            ProductCatalogueProcessRoleResolver.Parse("Combined")
        );

        Assert.DoesNotContain("ArcGIS", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CommandLineRoleOverridesEnvironmentRole() {
        var role = ProductCatalogueProcessRoleResolver.Resolve(
            ["--ProductCatalogue:ProcessRole=Worker"],
            "Api"
        );

        Assert.Equal(ProductCatalogueProcessRole.Worker, role);
    }

    [Fact]
    public void WorkerWindowsServiceContractUsesAStableServiceNameAndContextAwareRegistration() {
        var services = new ServiceCollection();

        var result = services.AddProductCatalogueWorkerWindowsService();

        Assert.Same(services, result);
        Assert.Equal("ProductCatalogueWorker", ProductCatalogueWorkerWindowsService.ServiceName);
        Assert.Equal("Product Catalogue Worker", ProductCatalogueWorkerWindowsService.DisplayName);
    }

    private static void AssertConstructorConsumesProductManager(Type consumerType) {
        Assert.Contains(
            consumerType.GetConstructors().SelectMany(constructor => constructor.GetParameters()),
            parameter => parameter.ParameterType == typeof(IProductManager)
        );
    }
}
