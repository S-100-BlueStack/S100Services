using Hangfire;
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
                await RunWorkerAsync(args, processProfile);
                return;
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
            #region Authorization. Disabled for now..

            ////  Windows SSO
            //builder.Services.AddHttpContextAccessor();
            //builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();

            //var path = builder.Configuration["Policies"];
            //if (string.IsNullOrEmpty(path))
            //    Log.Error("No path configured for authorization groups file! Please set 'Policies' in appsettings.json to point to a valid JSON file containing group policies.");

            //var json = File.ReadAllText(path!);
            //var groupPolicies = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string[]>>(json, new JsonSerializerOptions {
            //    ReadCommentHandling = JsonCommentHandling.Skip,
            //    AllowTrailingCommas = true
            //}) ?? [];

            //builder.Services.AddAuthorization(options => {

            //    options.FallbackPolicy = options.DefaultPolicy;
            //    foreach (var policy in groupPolicies) {
            //        options.AddPolicy(policy.Key, p => {
            //            switch (policy.Key) {
            //                case "productmanager:distribute":
            //                    p.RequireClaim(ClaimTypes.PrimarySid, policy.Value);
            //                    break;
            //                case "productmanager:access":
            //                case "productmanager:manage":
            //                    p.RequireClaim("http://schemas.microsoft.com/ws/2008/06/identity/claims/groupsid", policy.Value);
            //                    break;
            //                default:
            //                    throw new Exception($"Unknown authorization policy: {policy.Key}");
            //            }
            //        });
            //    }
            //});
            //Log.Information("Authorization policies configured");
            #endregion
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

            app.UseHangfireDashboard("/dashboard", new DashboardOptions {
                //   Authorization = new[] { new MyAuthorizationFilter() }             // TODO: Auth
            });

            // Change detection and change-summary processing jobs are registered for explicit invocation only.
            // Scheduling is intentionally deferred until operational cadence and rulesets are approved.

            app.UseExceptionHandler();
            // Configure the HTTP request pipeline.
            app.UseSwagger();
            app.UseSwaggerUI(e => e.RoutePrefix = "swagger");

            app.UseHttpsRedirection();
#if DEBUG
            app.UseCors("AllowFrontend");
#endif

            app.UseAuthentication();
            app.UseAuthorization();

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
                .AllowAnonymous();

                app.MapGet("/mock/s102", () => {
                    return GetMockGeoJson("s102.geojson");
                })
                .Produces(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .AllowAnonymous();
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
