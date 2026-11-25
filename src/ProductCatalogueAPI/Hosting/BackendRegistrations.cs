using Hangfire.SqlServer;
using Hangfire;
using ProductCatalogueAPI.BackgroundProcessing.Filters;
using ProductCatalogueAPI.BackgroundProcessing.Scheduling;
using ProductCatalogueAPI.BackgroundProcessing;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Dashboard;
using ProductCatalogueAPI.Services.Distribution;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.History;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Services.S102;
using ProductCatalogueAPI.Services.SevenCs;
using ProductCatalogueAPI.Services.ValidationEmail;
using Serilog;
using ProductCatalogueAPI.Services.Detection;

namespace ProductCatalogueAPI.Hosting;

/// <summary>
/// Registers backend services shared by the API client process and the isolated Hangfire worker process.
/// </summary>
public static class BackendRegistrations
{
    /// <summary>Initializes the process-owned ArcGIS manager, then configures shared and role-specific backend services.</summary>
    /// <param name="services">The API or Worker service collection.</param>
    /// <param name="configuration">Effective configuration for the selected process.</param>
    /// <param name="processProfile">Defines the ArcGIS lane and background execution ownership.</param>
    /// <returns>A task that completes when backend registration is ready.</returns>
    internal static async Task AddProductCatalogueServicesAsync(this IServiceCollection services, ConfigurationManager configuration, ProductCatalogueProcessProfile processProfile) {
        await services.AddS100ProductCatalogue(configuration, processProfile.ArcGisExecutionLane);
        services.AddProductCatalogueBackend(configuration, processProfile);
    }

    /// <summary>Registers System database, scheduling clients and the services enabled for the selected process.</summary>
    /// <param name="services">The API or Worker service collection.</param>
    /// <param name="configuration">Effective backend configuration.</param>
    /// <param name="processProfile">Controls whether this process executes background work.</param>
    /// <returns>The service collection for continued registration.</returns>
    public static IServiceCollection AddProductCatalogueBackend(
        this IServiceCollection services,
        IConfiguration configuration,
        ProductCatalogueProcessProfile processProfile
    ) {
        ArgumentNullException.ThrowIfNull(processProfile);

        AddIcEncDistribution(services, configuration);
        services.AddSingleton(processProfile);
        AddHangfire(services, configuration);

        services.AddSingleton<DbConnectionFactory>();
        services.AddScoped<ProductRepository>();
        services.AddScoped<IProductRepository>(provider => provider.GetRequiredService<ProductRepository>());
        services.AddScoped<IDashboardReportingRepository, SqlDashboardReportingRepository>();
        services.AddScoped<IProductWorkflowRepository>(provider => provider.GetRequiredService<ProductRepository>());
        services.AddScoped<IEncPackageRepository, EncPackageRepository>();
        services.AddScoped<IEncPackageControlRepository, EncPackageControlRepository>();
        services.AddScoped<IEncPackageActionService, EncPackageActionService>();
        services.AddScoped<IEncPackageAcknowledgementRepository, EncPackageAcknowledgementRepository>();
        services.AddScoped<IIcEncAcknowledgementService, IcEncAcknowledgementService>();
        services.AddValidationEmailProcessing(configuration, processProfile.RunsHangfireServer);
        services.AddScoped<IProductWorkspaceFreshnessRepository, ProductWorkspaceFreshnessRepository>();
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
            S100CompilerConfiguration.ResolveExecutablePath(configuration),
            ExportToolConfiguration.ResolveMapperExecutablePath(configuration),
            ExportToolConfiguration.ResolveS57ExecutablePath(configuration)
        ));
        services.AddSingleton<IExportEngine, Hdf5ExportEngine>();
        services.AddSingleton<IExportEngine, GmlExportEngine>();
        services.AddSingleton<IExportEngineRegistry, ExportEngineRegistry>();
        services.AddSingleton<ISevenCsService, SevenCsService>();
        services.AddScoped<IProductExportHistory, ProductExportHistory>();
        services.AddScoped<IProductHistoryRecoveryRepository, ProductHistoryRecoveryRepository>();
        services.AddSingleton<IProductHistoryJobReader>(_ => new ProductHistoryJobReader(JobStorage.Current));
        services.AddScoped<ProductHistoryReconciliation>();
        services.AddTransient<ProductHistoryReconciliationJob>();
        services.AddHostedService<ProductHistoryReconciliationRegistration>();
        services.AddScoped<IExportOperationService, ExportOperationService>();
        services.AddScoped<IEncPackageDetectionService, EncPackageDetectionService>();
        services.AddScoped<IEncPackageFinalizationService, EncPackageFinalizationService>();
        services.AddTransient<FinalizeEncPackageJob>();
        services.AddTransient<DiscardEncPackageJob>();
        services.AddScoped<ExportJobExecutor>();
        services.AddTransient<ExportOperationJob>();
        services.AddTransient<UploadSingularProductJob>();
        services.AddTransient<DetectProductChangesJob>();
        services.AddScoped<IS102ChangeDetector, S102ChangeDetector>();
        services.AddTransient<DetectS102ChangesJob>();

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

    private static void AddIcEncDistribution(IServiceCollection services, IConfiguration configuration) {
        services.AddSingleton<Microsoft.Extensions.Options.IValidateOptions<SendToIcEncOptions>, SendToIcEncOptionsValidator>();
        services
            .AddOptions<SendToIcEncOptions>()
            .Bind(configuration.GetSection(SendToIcEncOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<ISendToIcEncJobService, HangfireSendToIcEncJobService>();
        services.AddTransient<IIcEncDeliveryRepository, IcEncDeliveryRepository>();
        services.AddTransient<IIcEncTransport, IcEncFtpsTransport>();
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
                .UseFilter(new CoalescingDpcFilter())
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
