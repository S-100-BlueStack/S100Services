using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Repositories;
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
}
