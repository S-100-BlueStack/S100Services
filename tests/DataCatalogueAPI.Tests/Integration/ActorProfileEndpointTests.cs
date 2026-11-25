using System.Net;
using System.Net.Http.Json;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using DataCatalogue.Api.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class ActorProfileEndpointTests(CatalogueFixture runtime)
{
    private sealed class DirectoryStub : IActorProfileDirectory
    {
        private int _calls;
        public int Calls => Volatile.Read(ref this._calls);
        public ActorProfileResponse? Find(string actor) {
            Interlocked.Increment(ref this._calls);
            return new ActorProfileResponse(actor, "Example user", null, null);
        }
    }

    [Fact]
    public async Task Profile_read_requires_access_and_resolves_only_an_event_in_the_selected_package() {
        var directory = new DirectoryStub();
        await using var app = await CatalogueApplication.CreateAsync(runtime, configureServices: services => {
            services.RemoveAll<IActorProfileDirectory>();
            services.AddSingleton<IActorProfileDirectory>(directory);
        });
        var client = app.Client;
        await app.CreateAsync<CategoryResponse>("/v1/dispatcher/categories", new { id = "test", displayName = "Test", description = "Test fixtures", prefix = "TT" });
        const string actor = @"PROD\B123456";
        client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        client.DefaultRequestHeaders.Add(TestAuthentication.UserHeader, actor);
        var package = await app.CreateAsync<PackageResponse>("/v1/packages", new { category = "test", absoluteUri = "https://example.org/input.zip", esriJSON = CatalogueTest.Geometry });
        var other = await app.CreateAsync<PackageResponse>("/v1/packages", new { category = "test", absoluteUri = "https://example.org/other.zip", esriJSON = CatalogueTest.DistantGeometry });
        var history = (await client.GetFromJsonAsync<PackageHistoryResponse>($"/v1/packages/{package.Id}/history"))!;
        var created = Assert.Single(history.Items, item => item.EventType == "packageCreated");
        var severity = Assert.Single(history.Items, item => item.EventType == "severityUpdated");
        var path = $"/v1/packages/{package.Id}/history/{created.Id}/profile";

        client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Add(TestAuthentication.UserHeader, @"PROD\reader");
        client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-DenyAccess");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/v1/packages/{other.Id}/history/{created.Id}/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/v1/packages/{package.Id}/history/{Guid.NewGuid()}/profile")).StatusCode);
        Assert.Equal(0, directory.Calls);

        using var response = await client.GetAsync(path + "?actor=spoofed");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore == true);
        var profile = (await response.Content.ReadFromJsonAsync<ActorProfileResponse>())!;
        Assert.Equal(actor, profile.Actor);
        Assert.Equal("Example user", profile.DisplayName);
        Assert.Equal(actor, (await client.GetFromJsonAsync<ActorProfileResponse>($"/v1/packages/{package.Id}/history/{severity.Id}/profile"))!.Actor);
        Assert.Equal(1, directory.Calls);
    }
}
