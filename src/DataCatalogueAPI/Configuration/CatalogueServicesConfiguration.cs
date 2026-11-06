using DataCatalague.Api.Domain;
using DataCatalague.Api.Initialization;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services.Commands;
using Eventuous;
using Microsoft.Extensions.DependencyInjection.Extensions;
using System.Text.Json;

namespace DataCatalague.Api.Configuration;

/// <summary>Registers the event store, command services, repositories and subscriptions used by the API.</summary>
public static class CatalogueServicesConfiguration
{
    public static IServiceCollection AddCatalogueRuntimeServices(this IServiceCollection services) {
        IEventSerializer serializer = new DefaultEventSerializer(new JsonSerializerOptions(JsonSerializerDefaults.Web));
        EventSerializer.SetDefault(serializer);
        services.AddSingleton(serializer);
        services.AddSingleton<StreamNameMap>();
        // Tests can provide one externally owned CoreHost dispatcher for their process.
        services.TryAddSingleton<ArcGisDispatcher>();
        services.AddSingleton<DispatchRepository>();
        services.AddSingleton<PackageRepository>();
        services.AddSingleton<InMemoryPipelineRepository>();
        services.AddSingleton<IPipelineRepository>(sp => sp.GetRequiredService<InMemoryPipelineRepository>());
        services.AddTransient<SamplePackageReader>();
        services.AddTransient<SampleDataInitialization>();
        services.AddCommandService<CategoryCommandService, CategoryState>();
        services.AddCommandService<BindingCommandService, BindingState>();
        services.AddCommandService<PackageCommandService, PackageState>();
        services.AddCommandService<PipelineCommandService, PipelineState>();
        services.AddSingleton<InMemoryEventStore>();
        services.AddSingleton<IEventStore>(sp => sp.GetRequiredService<InMemoryEventStore>());
        services.AddCheckpointStore<InMemoryCheckpointStore>();
        services.AddSubscription<InMemoryAllStreamSubscription, InMemoryAllStreamSubscriptionOptions>("dispatcher-subscription", subscription => subscription
            .AddEventHandler(sp => sp.GetRequiredService<DispatchRepository>(), ownsHandler: false)
            .AddEventHandler(sp => sp.GetRequiredService<PackageRepository>(), ownsHandler: false)
            .AddEventHandler(sp => sp.GetRequiredService<InMemoryPipelineRepository>(), ownsHandler: false));
        return services;
    }
}
