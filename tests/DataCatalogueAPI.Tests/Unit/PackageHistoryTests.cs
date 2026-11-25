using System.Security.Claims;
using System.Text.Json;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Domain.Events;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services;
using DataCatalague.Api.Services.Commands;
using Eventuous;
using Microsoft.Extensions.Logging.Abstractions;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class PackageHistoryTests
{
    private static PackageHistoryService History(InMemoryEventStore store) => new(store, new StreamNameMap(), new InMemoryPipelineRepository(NullLogger<InMemoryPipelineRepository>.Instance));

    private static async Task CreateAsync(InMemoryEventStore store, string id) {
        (await new PackageCommandService(store).Handle(new PackagesCommands.CreatePackage(id, "test", "input.zip", "https://example.org/private.zip", "private-aoi", ulong.MaxValue, null, null), default)).ThrowIfError();
    }

    [Fact]
    public async Task History_contains_only_committed_events_for_the_requested_package_including_removed_bindings() {
        var store = new InMemoryEventStore();
        await CreateAsync(store, "package");
        await CreateAsync(store, "other");
        var bindings = new BindingCommandService(store);
        (await bindings.Handle(new DispatcherCommands.Bind("package::enc", "package", "enc"), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.Unbind("package::enc"), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.RestoreBinding("package::enc"), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.Unbind("package::enc"), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.Bind("other::other-pipeline", "other", "other-pipeline"), default)).ThrowIfError();
        var commands = new PackageCommandService(store);
        (await commands.Handle(new PackagesCommands.ReplaceGeometry("package", "new-aoi", new DetailedGeometry("point", null, null), "same-request"), default)).ThrowIfError();
        (await commands.Handle(new PackagesCommands.ReplaceGeometry("package", "new-aoi", new DetailedGeometry("point", null, null), "same-request"), default)).ThrowIfError();

        var service = History(store);
        var result = (await service.GetAsync("package", null, 100, default))!;
        Assert.Equal("package", result.PackageId);
        Assert.Equal(7, result.Items.Count);
        Assert.Equal(ulong.MaxValue.ToString(System.Globalization.CultureInfo.InvariantCulture), Assert.Single(result.Items, item => item.EventType == "severityUpdated").Severity);
        Assert.Equal(2, result.Items.Count(item => item.EventType == "pipelineUnassigned" && item.PipelineId == "enc"));
        Assert.Equal(2, result.Items.Count(item => item.EventType == "pipelineAssigned" && item.PipelineId == "enc"));
        Assert.Single(result.Items, item => item.EventType == "geometryReplaced");
        Assert.All(result.Items, item => Assert.Null(item.Actor));
        Assert.DoesNotContain(result.Items, item => item.PipelineId == "other-pipeline");
        Assert.Equal(result.Items.OrderByDescending(item => item.OccurredAtUtc).Select(item => item.Id), result.Items.Select(item => item.Id));
        Assert.Null(result.NextBefore);
        Assert.Null(await service.GetAsync("missing", null, 50, default));
        Assert.Null(await History(new InMemoryEventStore()).GetAsync("package", null, 50, default));
        await Assert.ThrowsAsync<InvalidDataException>(() => service.GetAsync("other", result.Items[0].Id, 1, default));
    }

    [Fact]
    public async Task Atomic_creation_bindings_are_visible_without_waiting_for_the_subscription_and_paging_retains_identity() {
        var store = new InMemoryEventStore();
        var streams = new StreamNameMap();
        var package = new Package();
        await package.CreatePackage("package", "test", "input.zip", "https://example.org/input.zip", "aoi", 0, null, null);
        var binding = new Binding();
        await binding.Create("package::enc", "package", "enc");
        static NewStreamAppend Append(StreamName stream, IEnumerable<object> events) => new(stream, ExpectedStreamVersion.NoStream, events.Select(payload => new NewStreamEvent(Guid.NewGuid(), payload, new())).ToArray());
        await store.AppendEvents([
            Append(streams.GetStreamName(new BindingId("package::enc")), binding.Changes),
            Append(streams.GetStreamName(new PackageId("package")), package.Changes),
        ], default);
        var service = History(store);
        var all = (await service.GetAsync("package", null, 100, default))!;
        var first = (await service.GetAsync("package", null, 1, default))!;
        Assert.Equal(all.Items[0].Id, first.NextBefore);
        var second = (await service.GetAsync("package", first.NextBefore, 2, default))!;
        Assert.Equal(all.Items.Select(item => item.Id), first.Items.Concat(second.Items).Select(item => item.Id));
        Assert.Contains(all.Items, item => item.EventType == "pipelineAssigned");
        Assert.Null(second.NextBefore);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.GetAsync("package", null, 1, cancellation.Token));
    }

    [Fact]
    public async Task History_projects_the_actor_of_each_committed_event_without_reassigning_retries() {
        var store = new InMemoryEventStore();
        var packages = new PackageCommandService(store);
        var bindings = new BindingCommandService(store);
        const string creator = @"PROD\B111111";
        const string editor = @"PROD\B222222";
        const string assigner = @"PROD\B333333";
        const string remover = @"PROD\B444444";
        (await packages.Handle(new PackagesCommands.CreatePackage("package", "test", "input.zip", "https://example.org/input.zip", "aoi", 1, null, null, new DetailedGeometry("point", null, null), Actor: creator), default)).ThrowIfError();
        (await packages.Handle(new PackagesCommands.UpdateSeverity("package", 2, editor), default)).ThrowIfError();
        (await packages.Handle(new PackagesCommands.AddDetailedGeometry("package", "point-2", null, null, Actor: editor), default)).ThrowIfError();
        (await packages.Handle(new PackagesCommands.ReplaceGeometry("package", "aoi-2", new("point-3", null, null), "same-request", editor), default)).ThrowIfError();
        (await packages.Handle(new PackagesCommands.ReplaceGeometry("package", "unused", new(null, null, null), "same-request", remover), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.Bind("package::enc", "package", "enc", assigner), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.Unbind("package::enc", remover), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.Unbind("package::enc", editor), default)).ThrowIfError();
        (await bindings.Handle(new DispatcherCommands.RestoreBinding("package::enc", editor), default)).ThrowIfError();

        var items = (await History(store).GetAsync("package", null, 100, default))!.Items;
        Assert.Equal(9, items.Count);
        Assert.Equal(creator, Assert.Single(items, item => item.EventType == "packageCreated").Actor);
        Assert.Equal(creator, Assert.Single(items, item => item.EventType == "severityUpdated" && item.Severity == "1").Actor);
        Assert.Equal(editor, Assert.Single(items, item => item.EventType == "severityUpdated" && item.Severity == "2").Actor);
        Assert.Equal(new[] { creator, editor }, items.Where(item => item.EventType == "detailedGeometryAdded").Select(item => item.Actor).Order(StringComparer.Ordinal).ToArray());
        Assert.Equal(editor, Assert.Single(items, item => item.EventType == "geometryReplaced").Actor);
        Assert.Equal(new[] { editor, assigner }, items.Where(item => item.EventType == "pipelineAssigned").Select(item => item.Actor).Order(StringComparer.Ordinal).ToArray());
        Assert.Equal(remover, Assert.Single(items, item => item.EventType == "pipelineUnassigned").Actor);
    }

    [Fact]
    public void History_actor_uses_only_an_authenticated_principal_and_legacy_events_remain_unattributed() {
        const string account = @"PROD\B111111";
        var name = new Claim(ClaimTypes.Name, account);
        Assert.Null(PackageHistoryActor.FromPrincipal(null));
        Assert.Null(PackageHistoryActor.FromPrincipal(new ClaimsPrincipal(new ClaimsIdentity([name]))));
        Assert.Null(PackageHistoryActor.FromPrincipal(new ClaimsPrincipal(new ClaimsIdentity("Windows"))));
        Assert.Equal(account, PackageHistoryActor.FromPrincipal(new ClaimsPrincipal(new ClaimsIdentity([name], "Windows"))));

        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var legacy = JsonSerializer.Deserialize<PackagesEvents.V1.SeverityUpdated>("""
            {"severity": 42, "utc": "2026-01-15T10:00:00Z"}
            """, options)!;
        var binding = JsonSerializer.Deserialize<DispatcherEvents.V1.Binded>("""
            {"bindingId":"package::enc","packageId":"package","pipelineId":"enc","utc":"2026-01-15T10:00:00Z"}
            """, options)!;
        Assert.Null(legacy.Actor);
        Assert.Null(binding.Actor);
        var attributed = legacy with { Actor = account };
        Assert.Equal(account, JsonSerializer.Deserialize<PackagesEvents.V1.SeverityUpdated>(JsonSerializer.Serialize(attributed, options), options)!.Actor);
        var system = binding with { Actor = PackageHistoryActor.SystemActor };
        Assert.Equal("System", JsonSerializer.Deserialize<DispatcherEvents.V1.Binded>(JsonSerializer.Serialize(system, options), options)!.Actor);
    }
}
