using Hangfire;
using Hangfire.SqlServer;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Hosting;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.ExportRules;
using ProductCatalogueAPI.Services.History;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Services.SevenCs;
using Serilog;

namespace ProductCatalogueAPI;

/// <summary>
/// Registers backend services shared by the API client process and the isolated Hangfire worker process.
/// </summary>
public static class BackendRegistrations
{
    public static IServiceCollection AddProductCatalogueBackend(
        this IServiceCollection services,
        IConfiguration configuration,
        ProductCatalogueProcessProfile processProfile
    ) {
        ArgumentNullException.ThrowIfNull(processProfile);

        services.AddSingleton(processProfile);
        AddHangfire(services, configuration);

        services.AddSingleton<DbConnectionFactory>();
        services.AddScoped<ProductRepository>();
        services.AddScoped<IProductRepository>(provider => provider.GetRequiredService<ProductRepository>());
        services.AddScoped<IProductWorkflowRepository>(provider => provider.GetRequiredService<ProductRepository>());
        services.AddScoped<IProductHistoryEventRepository, ProductHistoryEventRepository>();
        services.AddScoped<IProductHistoryEventService, ProductHistoryEventService>();

        services.AddSingleton<IDatasetLockService, DatasetLockService>();
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IExportJobService, HangfireExportJobService>();
        services.AddSingleton<IHangfireJobStorageAccessor>(_ => new HangfireJobStorageAccessor(JobStorage.Current));
        services.AddSingleton<IJobStatusService, HangfireJobStatusService>();
        services.AddMemoryCache();

        services.AddProductCatalogueExportExecution(configuration, processProfile);
        services.AddProductCatalogueHangfireServer(processProfile);

        Log.Information(
            "Product Catalogue backend configured. ProcessRole: {ProcessRole}. ArcGisExecutionLane: {ArcGisExecutionLane}. RunsHangfireServer: {RunsHangfireServer}. HangfireWorkerCount: {HangfireWorkerCount}",
            processProfile.Role,
            processProfile.ArcGisExecutionLane,
            processProfile.RunsHangfireServer,
            processProfile.HangfireWorkerCount
        );

        return services;
    }

    internal static IServiceCollection AddProductCatalogueExportExecution(
        this IServiceCollection services,
        IConfiguration configuration,
        ProductCatalogueProcessProfile processProfile
    ) {
        if (!processProfile.RunsHangfireServer)
            return services;

        services.AddSingleton<IExportEngine>(provider => new IsoIec8211ExportEngine(
            provider.GetRequiredService<ILogger<IsoIec8211ExportEngine>>(),
            configuration["ArtifactsPath"] ?? throw new InvalidOperationException("ArtifactsPath is not configured."),
            S100CompilerConfiguration.ResolveExecutablePath(configuration)
        ));
        services.AddSingleton<IExportEngine, Hdf5ExportEngine>();
        services.AddSingleton<IExportEngine, GmlExportEngine>();
        services.AddSingleton<IExportEngineRegistry, ExportEngineRegistry>();
        services.AddSingleton<IExportDecisionRuleSet, PendingS101ExportDecisionRuleSet>();
        services.AddSingleton<IExportDecisionRuleSet, PendingS57ExportDecisionRuleSet>();
        services.AddSingleton<IExportDecisionRuleSetRegistry, ExportDecisionRuleSetRegistry>();
        services.AddSingleton<ISevenCsService, SevenCsService>();
        services.AddScoped<IExportOperationService, ExportOperationService>();
        services.AddTransient<ExportOperationJob>();
        services.AddTransient<DetectProductChangesJob>();
        services.AddTransient<ProcessChangeSummariesJob>();

        return services;
    }

    internal static IServiceCollection AddProductCatalogueHangfireServer(
        this IServiceCollection services,
        ProductCatalogueProcessProfile processProfile
    ) {
        if (processProfile.RunsHangfireServer) {
            services.AddHangfireServer(options => {
                // A single worker preserves the existing serialized background ArcGIS execution contract.
                options.WorkerCount = processProfile.HangfireWorkerCount;
                options.ServerName = $"product-catalogue-worker:{Environment.MachineName}:{Environment.ProcessId}";
            });
        }

        return services;
    }

    private static void AddHangfire(IServiceCollection services, IConfiguration configuration) {
        var connectionFile = configuration.GetSection("Connections")["HangfireConnection"];

        if (string.IsNullOrWhiteSpace(connectionFile) || !File.Exists(connectionFile))
            throw new InvalidOperationException($"Hangfire:ConnectionFile is not configured or insufficient access: {connectionFile}");

        var connectionString = File.ReadAllText(connectionFile);
        services.AddHangfire(config => {
            config.SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
                .UseSimpleAssemblyNameTypeSerializer()
                .UseRecommendedSerializerSettings()
                .UseFilter(new ExportJobMetadataClientFilter())
                .UseSqlServerStorage(
                    nameOrConnectionString: connectionString,
                    options: new SqlServerStorageOptions {
                        CommandBatchMaxTimeout = TimeSpan.FromMinutes(5),
                        SlidingInvisibilityTimeout = TimeSpan.FromMinutes(5),
                        QueuePollInterval = TimeSpan.FromSeconds(10),
                        UseRecommendedIsolationLevel = true,
                        DisableGlobalLocks = true
                    }
                );
        });
    }
}
