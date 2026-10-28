using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services.Commands;
using Eventuous;

namespace DataCatalogue.Api.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class EventStoreTests
{
    // Create, remove and restore a binding using the real in-memory event store.
    // Expected: The binding keeps its ID and changes from active to inactive and back to active.
    [Fact]
    public async Task Binding_can_be_created_removed_and_restored_in_the_same_stream() {
        var store = new InMemoryEventStore();
        var commands = new BindingCommandService(store);
        var created = await commands.Handle(new DispatcherCommands.Bind("package::pipeline", "package", "pipeline"), default);
        created.ThrowIfError();
        Assert.True(created.Get()!.State.IsActive);
        var removed = await commands.Handle(new DispatcherCommands.Unbind("package::pipeline"), default);
        removed.ThrowIfError();
        Assert.False(removed.Get()!.State.IsActive);
        var restored = await commands.Handle(new DispatcherCommands.RestoreBinding("package::pipeline"), default);
        restored.ThrowIfError();
        Assert.True(restored.Get()!.State.IsActive);
        Assert.Equal(created.Get()!.State.Id, restored.Get()!.State.Id);
    }

    // Create a pipeline in one event store and check a separate instance.
    // Expected: Only the original store contains the pipeline stream.
    [Fact]
    public async Task A_new_store_does_not_inherit_previous_events() {
        var store = new InMemoryEventStore();
        var created = await new PipelineCommandService(store).Handle(new PipelineCommands.Create("pipeline", "ENC", "Description"), default);
        created.ThrowIfError();
        var stream = new StreamNameMap().GetStreamName(new PipelineId("pipeline"));
        Assert.True(await store.StreamExists(stream, default));
        Assert.False(await new InMemoryEventStore().StreamExists(stream, default));
    }
}
