using Hangfire;
using Hangfire.SqlServer;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Mvc; // Required for ApiVersion
using Microsoft.Data.SqlClient;
using ProductCatalogueService.Data.Database;
using ProductCatalogueService.Data.Repositories;
using S100FC.S128;
using Serilog;
using System.Data;
using System.Reflection;

namespace ProductCatalogueService
{
    public class Program
    {
        private const string outputTemplate = "{Timestamp:yyyy-MM-dd HH:mm:ss.fff}| [{Level:u3}] {Message:lj} {NewLine}{Exception}";
        public static async Task Main(string[] args) {
            // Bootstrap logging
            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .WriteTo.Console()
                .WriteTo.File(
                    path: "bootstrap.log",    // Log in project root
                    rollingInterval: RollingInterval.Infinite,
                    retainedFileCountLimit: 1,
                    shared: true)
                .CreateBootstrapLogger();

            Log.Information("Bootstrap logger started");

            var builder = WebApplication.CreateBuilder(args);
            // var development = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")?.Equals("Development", StringComparison.OrdinalIgnoreCase) == true;

            // Logging
            Log.Logger = new LoggerConfiguration()
             .MinimumLevel.Information()
             .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
             .MinimumLevel.Override("Microsoft.AspNetCore", Serilog.Events.LogEventLevel.Warning)
             .MinimumLevel.Override("Microsoft.Hosting.Lifetime", Serilog.Events.LogEventLevel.Warning)
             .Enrich.FromLogContext()
             .WriteTo.Console()
             .WriteTo.File(
                path: "ProductCatalogueAPI.log",
                rollingInterval: RollingInterval.Infinite,
                retainedFileCountLimit: 1,
                shared: true,
                outputTemplate: outputTemplate)
             .CreateLogger();
            builder.Host.UseSerilog(Log.Logger);

            // Add services to the container.
            builder.Services.AddControllers()
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

            });
#if DEBUG
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowFrontend",
                    policy => {
                        policy.WithOrigins("http://localhost:5173")
                              .AllowAnyHeader()
                              .AllowAnyMethod();
                    });
            });
#endif

            builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();

            builder.Services.AddAuthorization(options => {
                // By default, all incoming requests will be authorized according to the default policy.
                options.FallbackPolicy = options.DefaultPolicy;
            });

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


            // Bind configuration
            builder.Configuration
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true);



            // Configure ArcGIS and ProductManager
            await builder.Services.AddS100ProductManager(builder.Configuration);


            // Hangfire
            var filePath = builder.Configuration.GetSection("Connections")["HangfireConnection"];

            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                throw new InvalidOperationException($"Hangfire:ConnectionFile is not configured or insufficient access: {filePath}");

            var connectionString = File.ReadAllText(filePath);

            builder.Services.AddHangfire(config =>
            {
                config.SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
                    .UseSimpleAssemblyNameTypeSerializer()
                    .UseRecommendedSerializerSettings()
                    .UseSqlServerStorage(
                        nameOrConnectionString: connectionString,
                        options: new SqlServerStorageOptions {
                            CommandBatchMaxTimeout = TimeSpan.FromMinutes(5),
                            SlidingInvisibilityTimeout = TimeSpan.FromMinutes(5),
                            QueuePollInterval = TimeSpan.FromSeconds(10),
                            UseRecommendedIsolationLevel = true,
                            DisableGlobalLocks = true
                        });
            });


            // System DB
            builder.Services.AddSingleton<DbConnectionFactory>();
            builder.Services.AddScoped<IProductRepository, ProductRepository>();

            builder.Services.AddHangfireServer();

            // Caching
            builder.Services.AddMemoryCache();

            var app = builder.Build();

            app.UseHangfireDashboard("/dashboard", new DashboardOptions {
                //   Authorization = new[] { new MyAuthorizationFilter() }             // TODO: Auth
            });

            app.UseExceptionHandler();

            // Configure the HTTP request pipeline.
            app.UseSwagger();
            app.UseSwaggerUI();

            app.UseHttpsRedirection();

            app.UseAuthorization();

            app.Use(async (context, next) => {
                if (context.Request.Path == "/") {
                    context.Response.Redirect("/swagger");
                    return;
                }
                await next();
            });
#if DEBUG
            app.Environment.EnvironmentName = "Development";
#endif
            if (app.Environment.IsDevelopment()) {
                app.MapGet("/mock/products", (IWebHostEnvironment env) => {
                    //var path = Path.Combine(env.ContentRootPath, "mock", "some_products.geojson");
                    var path = Path.Combine(env.ContentRootPath, "mock", "products.geojson");

                    if (!System.IO.File.Exists(path))
                        return Results.NotFound();

                    return Results.File(path, "application/geo+json");
                })
                .Produces(StatusCodes.Status200OK)
                .AllowAnonymous();
            }
            app.UseCors("AllowFrontend");

            app.MapControllers();

            app.Run();
        }
    }
}