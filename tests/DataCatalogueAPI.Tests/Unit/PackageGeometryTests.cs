using System.Text.Json;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Domain.Events;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services.Commands;
using Eventuous;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class PackageGeometryTests
{
    // Commit geometry, reload it through a new command service and repeat the same request fingerprint.
    // Expected: replay retains the fingerprint, references and timestamp; the retry appends no event.
    [Fact]
    public async Task Geometry_retry_preserves_committed_state_after_event_replay() {
        var store = new InMemoryEventStore();
        var commands = new PackageCommandService(store);
        (await commands.Handle(new PackagesCommands.CreatePackage("package", "test", "input.zip", "https://example.org/input.zip", "original-aoi", 0, null, null), default)).ThrowIfError();
        var details = new DetailedGeometry("point", null, null);
        var replaced = await commands.Handle(new PackagesCommands.ReplaceGeometry("package", "new-aoi", details, "request-a"), default);
        replaced.ThrowIfError();
        var first = replaced.Get()!.State;
        var replayed = (await store.LoadState<PackageState, PackageId>(new StreamNameMap(), new("package"), true, default)).State;
        Assert.Equal("request-a", replayed.GeometryRequestHash);
        var retry = await new PackageCommandService(store).Handle(new PackagesCommands.ReplaceGeometry("package", "unused-aoi", new(null, null, "unused-surface"), "request-a"), default);
        retry.ThrowIfError();
        var same = retry.Get()!.State;
        Assert.Equal(first.GeometryRef, same.GeometryRef);
        Assert.Equal(first.DetailedGeometry!.PointRefs.ToArray(), same.DetailedGeometry!.PointRefs.ToArray());
        Assert.Null(same.DetailedGeometry.SurfaceRef);
        Assert.Equal(first.LastUpdatedUtc, same.LastUpdatedUtc);
        var events = 0;
        await foreach (var _ in store.ReadEvents(new StreamNameMap().GetStreamName(new PackageId("package")), new StreamReadPosition(0), 100, default)) { events++; }
        Assert.Equal(3, events); // PackageCreated, SeverityUpdated and one GeometryReplaced.
    }

    // Replace geometry with A, then B, then A again through the real command service.
    // Expected: only the current request is deduplicated; returning to A commits its new reference set.
    [Fact]
    public async Task Earlier_geometry_can_be_submitted_again_after_another_replacement() {
        var store = new InMemoryEventStore();
        var commands = new PackageCommandService(store);
        (await commands.Handle(new PackagesCommands.CreatePackage("package", "test", "input.zip", "https://example.org/input.zip", "original-aoi", 0, null, null), default)).ThrowIfError();
        (await commands.Handle(new PackagesCommands.ReplaceGeometry("package", "aoi-a", new("point-a", null, null), "request-a"), default)).ThrowIfError();
        (await commands.Handle(new PackagesCommands.ReplaceGeometry("package", "aoi-b", new(null, null, "surface-b"), "request-b"), default)).ThrowIfError();
        var restored = await commands.Handle(new PackagesCommands.ReplaceGeometry("package", "aoi-a-again", new("point-a-again", null, null), "request-a"), default);
        restored.ThrowIfError();
        Assert.Equal("aoi-a-again", restored.Get()!.State.GeometryRef);
        Assert.Equal("request-a", restored.Get()!.State.GeometryRequestHash);
        Assert.Equal("point-a-again", restored.Get()!.State.DetailedGeometry!.PointRef);
        Assert.Null(restored.Get()!.State.DetailedGeometry!.SurfaceRef);
    }

    // Replay a legacy replacement without a hash and a detail-only update after a hashed replacement.
    // Expected: old events remain readable and either geometry change clears the previous retry fingerprint.
    [Fact]
    public void Legacy_replacements_and_detail_changes_invalidate_previous_retry_fingerprints() {
        var legacy = JsonSerializer.Deserialize<PackagesEvents.V1.GeometryReplaced>("""
            {"Aoi":"legacy-aoi","Details":{"PointRef":null,"CurveRef":null,"SurfaceRef":"legacy-surface"},"UTC":"2026-10-28T00:00:00Z"}
            """)!;
        Assert.Null(legacy.RequestHash);
        var state = new PackageState { GeometryRequestHash = "old-request" };
        var replaced = state.When(legacy);
        Assert.Equal("legacy-aoi", replaced.GeometryRef);
        Assert.Null(replaced.GeometryRequestHash);
        var detailed = state.When(new PackagesEvents.V1.DetailedGeometryAdded("changed-point", null, null, DateTimeOffset.UtcNow));
        Assert.Equal("changed-point", detailed.DetailedGeometry!.PointRef);
        Assert.Null(detailed.GeometryRequestHash);
    }
}
