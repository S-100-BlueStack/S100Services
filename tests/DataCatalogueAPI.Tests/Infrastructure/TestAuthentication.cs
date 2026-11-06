using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DataCatalogue.Api.Tests.Infrastructure;

public sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "CatalogueTests";
    public const string UserHeader = "X-Test-User";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync() {
        var username = this.Request.Headers[UserHeader].ToString();
        if (string.IsNullOrWhiteSpace(username)) { return Task.FromResult(AuthenticateResult.NoResult()); }
        // This handler exists only in the test assembly. Production still uses Windows Negotiate.
        var claims = new List<Claim> { new(ClaimTypes.Name, username) };
        if (!this.Request.Headers.ContainsKey("X-Test-DenyAccess")) { claims.Add(new Claim("catalogue-test-access", "allowed")); }
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
    }
}
