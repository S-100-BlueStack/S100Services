using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ProductCatalogueAPI;
using ProductCatalogueAPI.Controllers;

namespace TestProductCatalogueAPI;

public sealed class WindowsSsoAuthorizationTests : IDisposable
{
    private const string Access = "productmanager:access";
    private const string Manage = "productmanager:manage";
    private const string Distribute = "productmanager:distribute";
    private const string AccessSid = "S-1-5-21-1-2-3-1001";
    private const string ManageSid = "S-1-5-21-1-2-3-1002";
    private const string DistributeSid = "S-1-5-21-1-2-3-1003";
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"pc-windows-sso-{Guid.NewGuid():N}");

    [Fact]
    public async Task WindowsSsoRegistersNegotiateAndAnAccessRestrictedFallback() {
        using var services = CreateProvider();
        var schemes = services.GetRequiredService<IAuthenticationSchemeProvider>();
        Assert.Equal(NegotiateDefaults.AuthenticationScheme, (await schemes.GetDefaultAuthenticateSchemeAsync())?.Name);
        Assert.Equal(NegotiateDefaults.AuthenticationScheme, (await schemes.GetDefaultChallengeSchemeAsync())?.Name);
        var policies = services.GetRequiredService<IAuthorizationPolicyProvider>();
        var fallback = await policies.GetFallbackPolicyAsync();
        Assert.NotNull(fallback);
        var authorization = services.GetRequiredService<IAuthorizationService>();

        Assert.True((await authorization.AuthorizeAsync(Principal(ClaimTypes.GroupSid, AccessSid), null, fallback!)).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(Principal(ClaimTypes.GroupSid, ManageSid), null, fallback!)).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(new ClaimsPrincipal(new ClaimsIdentity([], "Negotiate")), null, fallback!)).Succeeded);
    }

    [Theory]
    [InlineData(Access, ClaimTypes.GroupSid, AccessSid)]
    [InlineData(Manage, ClaimTypes.GroupSid, ManageSid)]
    [InlineData(Distribute, ClaimTypes.PrimarySid, DistributeSid)]
    public async Task PoliciesRequireAnAuthenticatedPrincipalAndTheConfiguredSidClaim(string policy, string claimType, string sid) {
        using var services = CreateProvider();
        var authorization = services.GetRequiredService<IAuthorizationService>();

        Assert.True((await authorization.AuthorizeAsync(Principal(claimType, sid), null, policy)).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(Principal(claimType, sid, authenticated: false), null, policy)).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(Principal(claimType, "S-1-5-21-1-2-3-9999"), null, policy)).Succeeded);
        var wrongType = claimType == ClaimTypes.PrimarySid ? ClaimTypes.GroupSid : ClaimTypes.PrimarySid;
        Assert.False((await authorization.AuthorizeAsync(Principal(wrongType, sid), null, policy)).Succeeded);
    }

    [Fact]
    public async Task EveryControllerRouteRejectsAnonymousAndRequiresItsOperationPolicyIncludingLegacyAliases() {
        using var services = CreateProvider();
        var policies = services.GetRequiredService<IAuthorizationPolicyProvider>();
        var authorization = services.GetRequiredService<IAuthorizationService>();
        var controllers = typeof(Program).Assembly.GetTypes()
            .Where(type => !type.IsAbstract && typeof(ControllerBase).IsAssignableFrom(type)).ToArray();
        var routeCount = 0;
        foreach (var controller in controllers) {
            Assert.Empty(controller.GetCustomAttributes(inherit: true).OfType<IAllowAnonymous>());
            foreach (var action in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance)) {
                var routes = action.GetCustomAttributes<HttpMethodAttribute>(inherit: true).ToArray();
                if (routes.Length == 0)
                    continue;
                Assert.Empty(action.GetCustomAttributes(inherit: true).OfType<IAllowAnonymous>());
                var data = controller.GetCustomAttributes(inherit: true).OfType<IAuthorizeData>()
                    .Concat(action.GetCustomAttributes(inherit: true).OfType<IAuthorizeData>()).ToArray();
                var expected = ExpectedPolicy(controller, action);
                Assert.Contains(data, item => item.Policy == expected);
                var combined = await AuthorizationPolicy.CombineAsync(policies, data);
                Assert.NotNull(combined);
                var claimType = expected == Distribute ? ClaimTypes.PrimarySid : ClaimTypes.GroupSid;
                var sid = expected switch { Access => AccessSid, Manage => ManageSid, _ => DistributeSid };
                Assert.True((await authorization.AuthorizeAsync(Principal(claimType, sid), null, combined!)).Succeeded);
                Assert.False((await authorization.AuthorizeAsync(Principal(claimType, sid, authenticated: false), null, combined!)).Succeeded);
                if (expected != Access)
                    Assert.False((await authorization.AuthorizeAsync(Principal(ClaimTypes.GroupSid, AccessSid), null, combined!)).Succeeded);
                routeCount += routes.Sum(route => route.HttpMethods.Count());
            }
        }

        // A new route/controller must be deliberately included in the security review.
        Assert.Equal(6, controllers.Length);
        Assert.Equal(36, routeCount);
    }

    [Fact]
    public void MissingPolicyPathFailsBeforeAuthenticationIsRegistered() {
        var services = new ServiceCollection();

        var error = Assert.Throws<InvalidOperationException>(() => Program.ConfigureWindowsSso(services, new ConfigurationManager()));

        Assert.Contains("Policies", error.Message);
        Assert.DoesNotContain(services, descriptor => descriptor.ServiceType == typeof(IAuthenticationService));
    }

    [Theory]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("{\"productmanager:access\":[]}")]
    [InlineData("{\"productmanager:access\":null}")]
    [InlineData("{\"productmanager:access\":[\" \"],\"productmanager:manage\":[\"M\"],\"productmanager:distribute\":[\"D\"]}")]
    [InlineData("{\"productmanager:access\":[\"A\"],\"productmanager:manage\":[\"M\"],\"productmanager:distribute\":[\"D\"],\"unknown\":[\"X\"]}")]
    public void MissingEmptyOrUnknownPoliciesFailAtStartup(string json) {
        Assert.Throws<InvalidOperationException>(() => CreateProvider(json));
    }

    private ServiceProvider CreateProvider(string? json = null) {
        Directory.CreateDirectory(_root);
        var path = Path.Combine(_root, "policies.json");
        File.WriteAllText(path, json ?? $$"""
            {
                // Keep support for the existing external policy-file format.
                "{{Access}}": ["{{AccessSid}}"],
                "{{Manage}}": ["{{ManageSid}}"],
                "{{Distribute}}": ["{{DistributeSid}}"],
            }
            """);
        using var configuration = new ConfigurationManager();
        configuration["Policies"] = path;
        var services = new ServiceCollection();
        services.AddLogging();
        Program.ConfigureWindowsSso(services, configuration);
        return services.BuildServiceProvider();
    }

    private static ClaimsPrincipal Principal(string claimType, string sid, bool authenticated = true) =>
        new(new ClaimsIdentity([new Claim(claimType, sid)], authenticated ? "Negotiate" : null));

    private static string ExpectedPolicy(Type controller, MethodInfo action) {
        if (controller == typeof(UploadController)) return Distribute;
        if (controller == typeof(ExportController)) return Manage;
        if (controller == typeof(EncPackageActionsController))
            return action.Name is nameof(EncPackageActionsController.GetActions) or nameof(EncPackageActionsController.GetDiscardJob) ? Access : Manage;
        if (controller == typeof(ElectronicProductsController) || controller == typeof(LookupController) || controller == typeof(JobsController))
            return Access;
        throw new InvalidOperationException("Unreviewed controller authorization: " + controller.FullName);
    }

    public void Dispose() {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }
}
