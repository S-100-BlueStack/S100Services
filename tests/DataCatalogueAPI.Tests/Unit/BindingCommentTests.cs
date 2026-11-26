using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using DataCatalague.Api.Services.Commands;
using Eventuous;
using Microsoft.Extensions.Logging.Abstractions;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class BindingCommentTests
{
    [Fact]
    public async Task Comment_replay_preserves_binding_state_and_scopes_existing_profile_resolution() {
        var store = new InMemoryEventStore();
        var streams = new StreamNameMap();
        var packages = new PackageCommandService(store);
        foreach (var id in new[] { "package", "other" }) {
            (await packages.Handle(new PackagesCommands.CreatePackage(id, "test", "input.zip", "https://example.org/input.zip", "aoi", 0, null, null), default)).ThrowIfError();
        }

        const string bindingId = "package::enc";
        const string actor = @"PROD\B123456";
        var bindings = new BindingCommandService(store);
        (await bindings.Handle(new DispatcherCommands.Bind(bindingId, "package", "enc"), default)).ThrowIfError();
        var assignments = new PipelineAssignmentService(store, streams, bindings, new PipelineAssignmentIndex());
        var original = await assignments.GetAsync(bindingId, default);
        Assert.Empty(assignments.ListComments("package", null, 50, default).Items);

        var saved = await assignments.AddCommentAsync("package", "enc", Guid.NewGuid(), "Review", actor, default);
        var current = await assignments.GetAsync(bindingId, default);
        Assert.True(current.IsActive);
        Assert.Equal(original.LastUpdatedUtc, current.LastUpdatedUtc);
        Assert.Equal(original.PackageId, current.PackageId);
        Assert.Equal(original.PipelineId, current.PipelineId);

        var history = new PackageHistoryService(store, streams, new InMemoryPipelineRepository(NullLogger<InMemoryPipelineRepository>.Instance));
        var timeline = (await history.GetAsync("package", null, 50, default))!;
        var comment = Assert.Single(timeline.Items, item => item.EventType == "bindingCommentAdded");
        Assert.NotNull(history.FindEvent("package", comment.Id, default));
        Assert.Equal(actor, history.FindEvent("package", comment.Id, default)!.Actor);
        Assert.Null(history.FindEvent("other", comment.Id, default));
        Assert.Equal(saved.Text, comment.CommentText);
    }

    [Fact]
    public async Task Availability_follows_retained_events_without_geometry_or_profile_services() {
        const string packageId = "package";
        const string bindingId = "package::enc";
        var store = new InMemoryEventStore();
        var streams = new StreamNameMap();
        var packages = new PackageCommandService(store);
        (await packages.Handle(new PackagesCommands.CreatePackage(packageId, "test", "input.zip", "https://example.org/input.zip", "unused-aoi", 0, null, null), default)).ThrowIfError();
        var bindings = new BindingCommandService(store);
        (await bindings.Handle(new DispatcherCommands.Bind(bindingId, packageId, "enc"), default)).ThrowIfError();
        var assignments = new PipelineAssignmentService(store, streams, bindings, new PipelineAssignmentIndex());

        bool? IsPresent() => Assert.Single(assignments.GetCommentAvailability([new BindingCommentScope(packageId, "enc")], default).Items).HasBindingComments;
        Assert.False(IsPresent());
        await assignments.AddCommentAsync(packageId, "enc", Guid.NewGuid(), "First", @"PROD\reader", default);
        Assert.True(IsPresent());
        var stream = streams.GetStreamName(new BindingId(bindingId));
        await store.TruncateStream(stream, new StreamTruncatePosition(0), ExpectedStreamVersion.Any, default);
        Assert.True(IsPresent());
        Assert.Single(assignments.ListComments(packageId, null, 50, default, "enc").Items);
        await store.TruncateStream(stream, new StreamTruncatePosition(1), ExpectedStreamVersion.Any, default);
        Assert.Null(IsPresent());
        Assert.Throws<KeyNotFoundException>(() => assignments.ListComments(packageId, null, 50, default, "enc"));

        // The assignment state was also truncated, so recreate the binding before appending again.
        await store.DeleteStream(stream, ExpectedStreamVersion.Any, default);
        (await bindings.Handle(new DispatcherCommands.Bind(bindingId, packageId, "enc"), default)).ThrowIfError();
        await assignments.AddCommentAsync(packageId, "enc", Guid.NewGuid(), "Second", @"PROD\reader", default);
        Assert.True(IsPresent());
        await store.DeleteStream(stream, ExpectedStreamVersion.Any, default);
        Assert.Null(IsPresent());
        Assert.Throws<KeyNotFoundException>(() => assignments.ListComments(packageId, null, 50, default, "enc"));
        await store.DeleteStream(streams.GetStreamName(new PackageId(packageId)), ExpectedStreamVersion.Any, default);
        Assert.Null(IsPresent());

        using var aborted = new CancellationTokenSource();
        aborted.Cancel();
        Assert.Throws<OperationCanceledException>(() => assignments.GetCommentAvailability([new BindingCommentScope(packageId, "enc")], aborted.Token));
    }
}
