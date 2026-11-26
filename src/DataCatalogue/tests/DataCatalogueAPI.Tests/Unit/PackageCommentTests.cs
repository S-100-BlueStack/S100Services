using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services;
using DataCatalague.Api.Services.Commands;
using Eventuous;
using Microsoft.Extensions.Logging.Abstractions;

namespace DataCatalogue.Api.Tests.Unit;

public sealed class PackageCommentTests
{
    [Fact]
    public async Task Old_package_replays_then_discard_records_one_operation_and_exact_history_actor() {
        const string id = "package";
        const string actor = @"PROD\reader";
        var store = new InMemoryEventStore();
        var streams = new StreamNameMap();
        var command = new PackageCommandService(store);
        (await command.Handle(new PackagesCommands.CreatePackage(id, "test", "input.zip", "https://example.org/input.zip", "aoi", 0, null, null), default)).ThrowIfError();
        Assert.False((await store.LoadState<PackageState, PackageId>(streams, new(id), true, default)).State.IsDiscarded);

        var comments = new PackageCommentService(store, streams, command, new PipelineAssignmentIndex());
        var operationId = Guid.NewGuid();
        var discard = await comments.Save(id, operationId, "Reason", actor, true, default);
        Assert.Equal(discard, await comments.Save(id, operationId, "  Reason  ", actor, true, default));
        Assert.True((await store.LoadState<PackageState, PackageId>(streams, new(id), true, default)).State.IsDiscarded);
        var history = new PackageHistoryService(store, streams, new InMemoryPipelineRepository(NullLogger<InMemoryPipelineRepository>.Instance));
        var entry = history.FindEvent(id, discard.HistoryEventId, default);
        Assert.Equal(actor, entry!.Actor);
        Assert.Equal<Guid?>(operationId, entry.OperationId);
        Assert.Null(history.FindEvent(id, operationId, default));
        Assert.Equal(operationId, Assert.Single(comments.List(id, null, 50, default).Items).Id);

        var reopen = await comments.Save(id, Guid.NewGuid(), null, actor, false, default);
        Assert.False((await store.LoadState<PackageState, PackageId>(streams, new(id), true, default)).State.IsDiscarded);
        Assert.Equal("notAssigned", (await comments.Save(id, operationId, "Reason", actor, true, default)).AssignmentStatus);
        Assert.Null(history.FindEvent(id, reopen.HistoryEventId, default)!.CommentText);
        Assert.Single(comments.List(id, null, 50, default).Items);
        await Assert.ThrowsAsync<PipelineAssignmentConflictException>(() => comments.Save(id, Guid.NewGuid(), null, actor, false, default));
    }
}
