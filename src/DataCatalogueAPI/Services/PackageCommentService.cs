using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;
using static DataCatalague.Api.Domain.Events.PackagesEvents.V1;

namespace DataCatalague.Api.Services;

public sealed class PackageCommentService(
    InMemoryEventStore store, StreamNameMap streams, ICommandService<PackageState> commands,
    PipelineAssignmentIndex assignments)
{
    public PackageCommentPageResponse List(string packageId, Guid? before, int size, CancellationToken token) {
        ValidateId(packageId);
        ArgumentOutOfRangeException.ThrowIfLessThan(size, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(size, 100);
        var events = store.ReadPackageStream(streams.GetStreamName(new PackageId(packageId)), token)
            ?? throw new KeyNotFoundException("Package not found.");
        var ordered = events.Where(item => item.Payload is PackageDiscarded)
            .Select(Map).OrderByDescending(item => item.OccurredAtUtc).ThenByDescending(item => item.Id).ToArray();
        var offset = 0;
        if (before is { } cursor) {
            offset = Array.FindIndex(ordered, item => item.Id == cursor) + 1;
            if (offset == 0) { throw new InvalidDataException("Comment continuation does not belong to this Package."); }
        }
        token.ThrowIfCancellationRequested();
        var page = ordered.Skip(offset).Take(size).ToArray();
        return new(packageId, page, offset + page.Length < ordered.Length ? page[^1].Id : null);
    }

    public async Task<PackageOperationResponse> Save(
        string packageId, Guid operationId, string? text, string actor, bool discarded, CancellationToken token) {
        ValidateId(packageId);
        if (operationId == Guid.Empty) { throw new InvalidDataException("Supply an operation ID."); }
        if (discarded == false ? text is not null : string.IsNullOrWhiteSpace(text) || text.Length > PipelineAssignmentService.MaximumCommentLength) {
            throw new InvalidDataException(discarded == false
                ? "Reopening cannot include a discard reason."
                : "Supply a comment of 1 to 4000 characters.");
        }

        var normalized = text?.Trim();
        var id = new PackageId(packageId);
        var stream = streams.GetStreamName(id);
        var kind = discarded ? "discardReason" : "reopen";
        await PipelineAssignmentService.MutationGate.WaitAsync(token);
        try {
            if (!await store.StreamExists(stream, token)) { throw new KeyNotFoundException("Package not found."); }
            if (store.ReadPackageOperation(operationId, token) is { } previous) {
                var receipt = Map(previous.Event);
                if (!previous.Stream.Equals(stream) || receipt.Kind != kind || receipt.Text != normalized ||
                    !string.Equals(receipt.Actor, actor, StringComparison.OrdinalIgnoreCase)) {
                    throw new PipelineAssignmentConflictException("The operation ID belongs to another Package operation.");
                }
                return receipt with { AssignmentStatus = assignments.GetSnapshot(packageId).Status };
            }
            if (store.ReadBindingComment(operationId, token) is not null) {
                throw new PipelineAssignmentConflictException("The operation ID belongs to a binding comment.");
            }
            var package = await store.LoadState<PackageState, PackageId>(streams, id, true, token);
            if (package.State.IsDiscarded == discarded) {
                throw new PipelineAssignmentConflictException("The requested assignment decision is already current.");
            }
            if (discarded && store.HasActiveBinding(packageId, token)) {
                throw new PipelineAssignmentConflictException("Remove all active Workstream bindings before discarding.");
            }
            var result = await commands.Handle(
                new PackagesCommands.ChangeDiscarded(packageId, operationId, discarded, normalized, actor), token);
            if (result.Exception is WrongVersion) {
                throw new PipelineAssignmentConflictException("The Package changed. Reload before retrying.");
            }
            result.ThrowIfError();
            assignments.UpdateDecision(packageId, discarded, result.Get()!.GlobalPosition);
            return ReadReceipt(operationId) with { AssignmentStatus = assignments.GetSnapshot(packageId).Status };
        }
        finally { PipelineAssignmentService.MutationGate.Release(); }
    }

    private PackageOperationResponse ReadReceipt(Guid id) =>
        store.ReadPackageOperation(id, CancellationToken.None) is { } saved
            ? Map(saved.Event) : throw new InvalidOperationException("Committed Package operation could not be read.");

    private static PackageOperationResponse Map(StreamEvent item) => item.Payload switch {
        PackageDiscarded decision => new(decision.OperationId, item.Id, "discardReason", decision.Reason, decision.Actor, decision.UTC.ToUniversalTime()),
        PackageReopened reopen => new(reopen.OperationId, item.Id, "reopen", null, reopen.Actor, reopen.UTC.ToUniversalTime()),
        _ => throw new InvalidOperationException("This event is not a Package comment or decision."),
    };

    private static void ValidateId(string packageId) {
        if (string.IsNullOrWhiteSpace(packageId) || packageId.Length > 200 || packageId != packageId.Trim() ||
            packageId.Any(char.IsControl) || packageId.Contains("::")) {
            throw new InvalidDataException("Supply a valid Package ID.");
        }
    }
}
