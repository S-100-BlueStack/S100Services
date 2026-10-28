using Hangfire;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Mvc; // Required for ApiVersion
using Microsoft.Extensions.Hosting;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.Hosting;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.OpenApi;
using S100FC.S128;
using Serilog;
using Serilog.Events;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;

namespace ProductCatalogueAPI
{
    public class Program
    {
        private const string outputTemplate = "{Timestamp:yyyy-MM-dd HH:mm:ss.fff}| [{Level:u3}] [{MachineName}] [{SourceContext}] {Message:lj} {NewLine}{Exception}";

        [STAThread]
        public static async Task Main(string[] args) {
            var processRole = ResolveProcessRole(args);
            var processProfile = ProductCatalogueProcessProfile.For(processRole);

            if (processRole == ProductCatalogueProcessRole.Worker) {
                // The local launcher starts the worker in a separate console, so its BAT title is not inherited.
                if (Environment.UserInteractive) {
                    try { Console.Title = "Product Catalogue Worker"; }
                    catch (IOException) { /* A service process may have no console to rename. */ }
                }

                await RunWorkerAsync(args, processProfile);
                return;
            }
            else if (processRole == ProductCatalogueProcessRole.Api) {
                if (Environment.UserInteractive) {
                    try { Console.Title = "Product Catalogue API"; }
                    catch (IOException) { /* A service process may have no console to rename. */ }
                }
            }

            var development = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")?.Equals("Development", StringComparison.OrdinalIgnoreCase) == true;
            var central_logpath = Environment.GetEnvironmentVariable("log_path");
            // Bootstrap logging
            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .WriteTo.Console()
                .WriteTo.File(
                    path: "logs/bootstrap.log",    // Log in project root
                    rollingInterval: RollingInterval.Infinite,
                    retainedFileCountLimit: 1,
                    shared: true)
                .CreateBootstrapLogger();
            Log.Information("Bootstrap logger started");

            var builder = CreateApplicationBuilder(args);
            var detectionState = DetectProductChangesState.FromConfiguration(builder.Configuration);
            builder.Services.AddSingleton(detectionState);
            // logging
            builder.Host.UseSerilog((context, loggerConfiguration) => {
                loggerConfiguration.MinimumLevel.Information()
                    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
                    .MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Warning)
                    .MinimumLevel.Override("Hangfire.Server.BackgroundServerProcess", LogEventLevel.Warning)
                    .MinimumLevel.Override("Hangfire.SqlServer.SqlServerObjectsInstaller", LogEventLevel.Warning)
                    .Enrich.FromLogContext()
                    .Enrich.WithProperty("MachineName", Environment.MachineName)
                    .WriteTo.Console(outputTemplate: outputTemplate, restrictedToMinimumLevel: LogEventLevel.Verbose)
                    .WriteTo.File(
                        path: "Logs/ProductManagerAPI.log",
                        rollingInterval: RollingInterval.Infinite,
                        retainedFileCountLimit: 1,
                        shared: true,
                        outputTemplate: outputTemplate);
                if (!string.IsNullOrWhiteSpace(central_logpath)) {
                    if (!Path.Exists(central_logpath))
                        Log.Warning("The specified log_path '{log_path}' does not exist or the system cannot access the folder.", central_logpath);

                    var centralLogPath = Path.Combine(central_logpath, "productmanager.dev", "Logging", $"{Environment.MachineName}", "ProductManagerAPI.log");
                    loggerConfiguration.WriteTo.File(
                        path: centralLogPath,
                        rollingInterval: RollingInterval.Day,
                        retainedFileCountLimit: 365,
                        shared: true,
                        outputTemplate: outputTemplate);
                }
                else {
                    Log.Warning("No central log path configured. Set environment variable 'log_path' to enable logging to a central location.");
                }
            });
            // Add services to the container.
            builder.Services.AddScoped<MutationAuditLogFilter>();
            builder.Services.AddControllers(options => options.Filters.AddService<MutationAuditLogFilter>())
             .AddJsonOptions(options => {
                 var o = options.JsonSerializerOptions;

                 o.WriteIndented = false;
                 o.Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping;
                 o.PropertyNameCaseInsensitive = true;
                 o.PropertyNamingPolicy = null;
                 o.AppendTypeInfoResolver();
             });
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            builder.Services.AddSwaggerGen(options => {
                // Include XML comments if generated
                var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
                var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
                if (File.Exists(xmlPath))
                    options.IncludeXmlComments(xmlPath);
                options.OperationFilter<ExportTargetOperationFilter>();
                options.OperationFilter<SwaggerAllowedValuesOperationFilter>();
            });
#if DEBUG
            builder.Services.AddCors(options => {
                options.AddPolicy("AllowFrontend",
                    policy => {
                        policy.WithOrigins(["http://localhost:5173", "https://localhost:5173", "https://localhost:5174"])
                              .AllowAnyHeader()
                              .AllowCredentials()
                              .AllowAnyMethod();
                    });
            });
#endif
            // API authentication is separate from the background Worker's service identity.
            ConfigureWindowsSso(builder.Services, builder.Configuration);
            builder.Services.AddApiVersioning(options => {
                options.AssumeDefaultVersionWhenUnspecified = true;
                options.DefaultApiVersion = new ApiVersion(1, 0);
                options.ReportApiVersions = true;
            });

            builder.Services.AddRouting(options => {
                options.LowercaseUrls = true;
            });

            // Problem details & Exception handling
            builder.Services.AddProblemDetails();
            builder.Services.AddExceptionHandler<CustomExceptionHandler>();


            // Configure ArcGIS and ProductCatalogue services
            await builder.Services.AddS100ProductCatalogue(
                builder.Configuration,
                processProfile.ArcGisExecutionLane
            );
            builder.Services.AddProductCatalogueBackend(builder.Configuration, processProfile);
            // Mail-Handling
            //try {
            //    builder.Services
            //        .AddOptions<MailImportOptions>()
            //        .Bind(builder.Configuration.GetSection(MailImportOptions.SectionName))
            //        .ValidateOnStart();
            //    builder.Services.AddScoped<IProductStatusEmailParser, ProductStatusEmailParser>();
            //    builder.Services.AddScoped<ProcessProductStatusEmailsJob>();
            //    // Graph
            //    builder.Services
            //        .AddOptions<GraphAuthOptions>()
            //        .Bind(builder.Configuration.GetSection(GraphAuthOptions.SectionName))
            //        .ValidateOnStart();
            //    builder.Services.AddSingleton<IGraphClientFactory, GraphClientFactory>();
            //    builder.Services.AddScoped<IGraphMailReaderService, GraphMailReaderService>();
            //}
            //catch (Exception ex) {
            //    Log.Error(ex, "Failed to configure mail import services. Mail import functionality will be unavailable.");
            //}

            var app = builder.Build();
            DetectProductChangesRecurringJob.Reconcile(
                detectionState,
                app.Services,
                app.Services.GetRequiredService<ILogger<DetectProductChangesJob>>()
            );

            // The enabled DPC schedule builds ENC packages; legacy summary processing stays unscheduled.

            app.UseExceptionHandler();
            // Configure the HTTP request pipeline.
            app.UseHttpsRedirection();
            app.UseRouting();
#if DEBUG
            app.UseCors("AllowFrontend");
#endif

            app.UseAuthentication();
            app.UseAuthorization();

            // Middleware endpoints must run after SSO; Swagger uses the access fallback.
            app.UseSwagger();
            app.UseSwaggerUI(e => e.RoutePrefix = "swagger");
            // Retain Hangfire's existing local-request restriction as well as requiring manage.
            app.MapHangfireDashboard("/dashboard").RequireAuthorization("productmanager:manage");
            app.MapControllers();
            app.Use(async (context, next) => {
                if (context.Request.Path == "/") {
                    context.Response.Redirect("/api/swagger");
                    return;
                }
                await next();
            });
            var mockDataSourcesEnabled = MockDataSourcesConfiguration.IsEnabled(
                builder.Configuration,
                app.Environment.IsDevelopment()
            );
            if (mockDataSourcesEnabled) {
                app.MapGet("/mock/paper-charts", () => {
                    return GetMockGeoJson("paper-charts.geojson");
                })
                .Produces(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .RequireAuthorization("productmanager:access");

                app.MapGet("/mock/s102", () => {
                    return GetMockGeoJson("s102.geojson");
                })
                .Produces(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .RequireAuthorization("productmanager:access");
            }
            //if (app.Environment.IsDevelopment() && 1 == 2) {
            //    using var scope = app.Services.CreateScope();
            //    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            //    try {
            //        var job = scope.ServiceProvider.GetRequiredService<ProcessProductStatusEmailsJob>();
            //        await job.RunAsync(CancellationToken.None);
            //    }
            //    catch (Exception ex) {
            //        logger.LogError(ex, "Failed to run {JobName} during startup.", nameof(ProcessProductStatusEmailsJob));
            //    }
            //}

            app.Run();
        }

        /// <summary>Restores Negotiate SSO and the configured SID-based API policies.</summary>
        /// <param name="services">The API host's services; the background Worker does not register HTTP authentication.</param>
        /// <param name="configuration">Contains the existing Policies path to the external SID policy JSON file.</param>
        /// <exception cref="InvalidOperationException">The policy path or any required policy is missing, empty or unknown.</exception>
        /// <exception cref="IOException">The configured policy file cannot be read.</exception>
        /// <exception cref="JsonException">The configured policy file is not a valid policy dictionary.</exception>
        internal static void ConfigureWindowsSso(IServiceCollection services, IConfiguration configuration) {
            var path = configuration["Policies"];
            if (string.IsNullOrWhiteSpace(path))
                throw new InvalidOperationException("Configure 'Policies' with the path to the Windows SID authorization policy JSON file.");

            var json = File.ReadAllText(path);
            var groupPolicies = JsonSerializer.Deserialize<Dictionary<string, string[]>>(json, new JsonSerializerOptions {
                ReadCommentHandling = JsonCommentHandling.Skip,
                AllowTrailingCommas = true
            }) ?? throw new InvalidOperationException("The Windows SID authorization policy file must contain a policy dictionary.");
            string[] requiredPolicies = ["productmanager:access", "productmanager:manage", "productmanager:distribute"];
            foreach (var policyName in requiredPolicies) {
                if (!groupPolicies.TryGetValue(policyName, out var sids) || sids is null || sids.Length == 0 || sids.Any(string.IsNullOrWhiteSpace))
                    throw new InvalidOperationException($"Authorization policy '{policyName}' must contain at least one non-empty SID.");
            }
            foreach (var policyName in groupPolicies.Keys) {
                if (!requiredPolicies.Contains(policyName, StringComparer.Ordinal))
                    throw new InvalidOperationException($"Unknown authorization policy: {policyName}");
            }

            services.AddHttpContextAccessor();
            services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();
            services.AddAuthorization(options => {
                foreach (var policy in groupPolicies) {
                    options.AddPolicy(policy.Key, p => {
                        p.RequireAuthenticatedUser();
                        var claimType = policy.Key == "productmanager:distribute"
                            ? ClaimTypes.PrimarySid
                            : ClaimTypes.GroupSid;
                        p.RequireClaim(claimType, policy.Value);
                    });
                }
                // Unannotated routes still require the baseline application access policy.
                options.FallbackPolicy = options.GetPolicy("productmanager:access");
            });
            Log.Information("Windows SSO authorization policies configured");
        }

        private static async Task RunWorkerAsync(
            string[] args,
            ProductCatalogueProcessProfile processProfile
        ) {
            var loggerConfiguration = new LoggerConfiguration()
                .MinimumLevel.Information()
                .Enrich.FromLogContext()
                .Enrich.WithProperty("MachineName", Environment.MachineName)
                .WriteTo.Console(outputTemplate: outputTemplate)
                .WriteTo.File(
                    path: Path.Combine(AppContext.BaseDirectory, "Logs", "ProductManagerWorker.log"),
                    rollingInterval: RollingInterval.Infinite,
                    retainedFileCountLimit: 1,
                    shared: true,
                    outputTemplate: outputTemplate
                );

            var centralLogRoot = Environment.GetEnvironmentVariable("log_path");
            if (!string.IsNullOrWhiteSpace(centralLogRoot) && Path.Exists(centralLogRoot)) {
                loggerConfiguration.WriteTo.File(
                    path: Path.Combine(
                        centralLogRoot,
                        "productmanager.dev",
                        "Logging",
                        Environment.MachineName,
                        "ProductManagerWorker.log"
                    ),
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 365,
                    shared: true,
                    outputTemplate: outputTemplate
                );
            }

            Log.Logger = loggerConfiguration.CreateLogger();

            var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings {
                Args = args,
                ContentRootPath = AppContext.BaseDirectory
            });
            builder.Logging.ClearProviders();
            builder.Logging.AddSerilog(Log.Logger, dispose: true);
            builder.Services.AddProductCatalogueWorkerWindowsService();

            var detectionState = DetectProductChangesState.FromConfiguration(builder.Configuration);
            builder.Services.AddSingleton(detectionState);
            await builder.Services.AddS100ProductCatalogue(
                builder.Configuration,
                processProfile.ArcGisExecutionLane
            );
            builder.Services.AddProductCatalogueBackend(builder.Configuration, processProfile);

            using var host = builder.Build();
            Log.Information(
                "Product Catalogue background worker starting. ProcessRole: {ProcessRole}. ProcessId: {ProcessId}. ArcGisExecutionLane: {ArcGisExecutionLane}. HangfireWorkerCount: {HangfireWorkerCount}",
                processProfile.Role,
                Environment.ProcessId,
                processProfile.ArcGisExecutionLane,
                processProfile.HangfireWorkerCount
            );
            await host.RunAsync();
        }

        private static ProductCatalogueProcessRole ResolveProcessRole(string[] args) {
            var environmentName = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
                ?? Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
            var configuration = new ConfigurationManager();
            configuration.SetBasePath(AppContext.BaseDirectory);
            configuration.AddJsonFile("appsettings.json", optional: true);
            if (!string.IsNullOrWhiteSpace(environmentName))
                configuration.AddJsonFile($"appsettings.{environmentName}.json", optional: true);
            configuration.AddEnvironmentVariables();
            configuration.AddCommandLine(args);

            return ProductCatalogueProcessRoleResolver.Parse(
                configuration[ProductCatalogueProcessRoleResolver.ConfigurationKey]
            );
        }

        internal static WebApplicationBuilder CreateApplicationBuilder(
            string[] args,
            string? contentRootPath = null
        ) => WebApplication.CreateBuilder(new WebApplicationOptions {
            Args = args,
            ContentRootPath = contentRootPath
        });

        private static IResult GetMockGeoJson(string fileName) {
            var resourceName = $"ProductCatalogueAPI.mock.{fileName}";
            var stream = typeof(Program).Assembly.GetManifestResourceStream(resourceName);

            if (stream is null)
                return Results.NotFound();

            return Results.Stream(stream, "application/geo+json");
        }
    }
}
