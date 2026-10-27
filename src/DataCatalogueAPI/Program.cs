using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Initialization;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services;
using Eventuous;
using ICSharpCode.SharpZipLib.Zip;
using Serilog;
using System.Text.Json;
using IO = System.IO;
using Microsoft.AspNetCore.Authentication.Negotiate;
using System.Security.Claims;

namespace DataCatalague.Api;

/// <summary>
/// Hosts the application entry point.
/// </summary>
public static class Program
{
    /// <summary>
    /// Builds, configures and runs the web application.
    /// </summary>
    /// <param name="args">The command line arguments passed to the process.</param>
    /// <returns>Zero when the host shut down normally, otherwise one.</returns>
    public static async Task<int> Main(string[] args) {
        // A bootstrap logger captures failures that happen before the host (and the
        // fully configured Serilog pipeline) is available.
        Log.Logger = new LoggerConfiguration()
            .WriteTo.Console()
            .CreateBootstrapLogger();

        try {
            var builder = WebApplication.CreateBuilder(args);

            builder.AddSerilogLogging();

            //ArcGIS.Core.Hosting.Host.Initialize();

            foreach (var f in System.IO.Directory.GetFiles(AppDomain.CurrentDomain.BaseDirectory, $"*s100ed17*.geodatabase*")) {                
                System.IO.File.Delete(System.IO.Path.GetFullPath(f));
            }

            FastZip fastZip = new();
            fastZip.ExtractZip(IO.Path.GetFullPath(IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"s100ed17.zip")), IO.Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory), null);

            builder.Services
                .AddDispatcherConfiguration(builder.Configuration)
                .AddPackageConfiguration(builder.Configuration);

            IEventSerializer eventSerializer = new DefaultEventSerializer(
                new JsonSerializerOptions(JsonSerializerDefaults.Web));

            EventSerializer.SetDefault(eventSerializer);

            builder.Services.AddSingleton(eventSerializer);
            builder.Services.AddSingleton<StreamNameMap>();
            builder.Services.AddSingleton<DispatchRepository>();
            builder.Services.AddSingleton<PackageRepository>();
            builder.Services.AddSingleton<InMemoryPipelineRepository>();
            builder.Services.AddSingleton<IPipelineRepository>(sp => sp.GetRequiredService<InMemoryPipelineRepository>());
            builder.Services.AddSingleton<ArcGisDispatcher>();

            builder.Services.AddTransient<SamplePackageReader>();
            builder.Services.AddTransient<SampleDataInitialization>();

            //builder.Services.AddEventuousSqlServer(
            //    "",
            //    "eventuous",
            //    initializeDatabase: true);

            //builder.Services.AddEventStore<SqlServerStore>();

            builder.Services.AddCommandService<CategoryCommandService, CategoryState>();
            builder.Services.AddCommandService<BindingCommandService, BindingState>();
            builder.Services.AddCommandService<PackageCommandService, PackageState>();
            builder.Services.AddCommandService<PipelineCommandService, PipelineState>();

            builder.Services.AddApplicationServices();
            builder.Services.AddApiVersioningSupport();
            builder.Services.AddVersionedOpenApiDocuments();
            builder.Services.AddSecureTransport();

            builder.Services.AddSingleton<InMemoryEventStore>();

            builder.Services.AddSingleton<IEventStore>(
                serviceProvider =>
                    serviceProvider.GetRequiredService<InMemoryEventStore>());

            builder.Services.AddCheckpointStore<InMemoryCheckpointStore>();

            builder.Services.AddSubscription<
                InMemoryAllStreamSubscription,
                InMemoryAllStreamSubscriptionOptions>(
                "dispatcher-subscription",
                // The type overload creates a subscription-keyed instance. Resolve the
                // singletons used by controllers so they read the populated caches.
                x => x.AddEventHandler(sp => sp.GetRequiredService<DispatchRepository>(), ownsHandler: false)
                    .AddEventHandler(sp => sp.GetRequiredService<PackageRepository>(), ownsHandler: false)
                    .AddEventHandler(sp => sp.GetRequiredService<InMemoryPipelineRepository>(), ownsHandler: false));


            //  Windows SSO
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();

            var path = builder.Configuration["Policies"];
            if (string.IsNullOrWhiteSpace(path)) {
                throw new InvalidOperationException("Set 'Policies' to the path of a private JSON authorization-policy file.");
            }
            path = Path.GetFullPath(path, builder.Environment.ContentRootPath);
            var json = await File.ReadAllTextAsync(path).ConfigureAwait(false);
            var groupPolicies = JsonSerializer.Deserialize<Dictionary<string, string[]>>(json, new JsonSerializerOptions {
                ReadCommentHandling = JsonCommentHandling.Skip,
                AllowTrailingCommas = true,
            }) ?? throw new InvalidOperationException("The authorization-policy file must contain an object mapping policy names to SID arrays.");

            if (!groupPolicies.ContainsKey("datacatalogue:access")) {
                throw new InvalidOperationException("The authorization-policy file must define 'datacatalogue:access'.");
            }
            foreach (var policy in groupPolicies) {
                if (policy.Key is not ("datacatalogue:access" or "datacatalogue:manage" or "datacatalogue:administrator")) {
                    throw new InvalidOperationException($"Unknown authorization policy: {policy.Key}");
                }
                if (policy.Value is null || policy.Value.Length == 0 || policy.Value.Any(string.IsNullOrWhiteSpace)) {
                    throw new InvalidOperationException($"Authorization policy '{policy.Key}' must contain at least one nonempty SID.");
                }
            }

            builder.Services.AddAuthorization(options => {
                foreach (var policy in groupPolicies) {
                    options.AddPolicy(policy.Key, p => {
                        p.RequireAuthenticatedUser();
                        // Preserve the existing administrator mapping to specific user SIDs.
                        var claimType = policy.Key == "datacatalogue:administrator" ? ClaimTypes.PrimarySid : ClaimTypes.GroupSid;
                        p.RequireClaim(claimType, policy.Value);
                    });
                }
                // A plain [Authorize] or an endpoint with no authorization metadata must
                // enforce access-group membership too, rather than authentication alone.
                options.DefaultPolicy = options.GetPolicy("datacatalogue:access")
                    ?? throw new InvalidOperationException("The access policy was not registered.");
                options.FallbackPolicy = options.DefaultPolicy;
            });
            Log.Information("Authorization policies configured");



            var app = builder.Build();

            using (var scope = app.Services.CreateScope()) {
                await scope.ServiceProvider.GetRequiredService<SampleDataInitialization>().InitializeAsync(app.Lifetime.ApplicationStopping).ConfigureAwait(false);
            }

            app.ConfigureRequestPipeline();

            await app.RunAsync().ConfigureAwait(false);
            return 0;
        }
        catch (Exception exception) when (exception is not HostAbortedException) {
            Log.Fatal(exception, "The application terminated unexpectedly.");
            return 1;
        }
        finally {
            await Log.CloseAndFlushAsync().ConfigureAwait(false);
        }
    }
}
