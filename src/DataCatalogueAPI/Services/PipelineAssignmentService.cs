using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Domain.Events;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;

namespace DataCatalague.Api.Services;

public sealed class PipelineAssignmentConflictException(string message) : Exception(message);

/// <summary>Changes package routing while retaining assignment event history.</summary>
public sealed class PipelineAssignmentService(InMemoryEventStore store, StreamNameMap streams, ICommandService<BindingState> commands, PipelineAssignmentIndex assignments)
{
    public const int MaximumCommentLength = 4000;
    public const int DefaultCommentPageSize = 50;
    public const int MaximumCommentPageSize = 100;

    public const int MaximumCommentAvailabilityBatchSize = 200;

    public BindingCommentAvailabilityResponse GetCommentAvailability(
        IReadOnlyList<BindingCommentScope?>? bindings, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        if (bindings is null || bindings.Count is < 1 or > MaximumCommentAvailabilityBatchSize) {
            throw new InvalidDataException("Supply 1 to 200 distinct Package–Pipeline bindings.");
        }
        var unique = new HashSet<(string, string)>();
        var scopes = new List<InMemoryEventStore.BindingCommentStream>(bindings.Count);
        foreach (var binding in bindings) {
            cancellationToken.ThrowIfCancellationRequested();
            var packageId = binding?.PackageId;
            var pipelineId = binding?.PipelineId;
            ValidateCommentScopeId(packageId);
            ValidateCommentScopeId(pipelineId);
            if (!unique.Add((packageId!, pipelineId!))) {
                throw new InvalidDataException("Package–Pipeline bindings must be distinct.");
            }
            scopes.Add(this.CommentStream(packageId!, pipelineId!));
        }

        var availability = store.ReadBindingCommentAvailability(scopes, cancellationToken);
        return new BindingCommentAvailabilityResponse(
            scopes.Select((scope, index) => new BindingCommentAvailabilityItem(
                scope.PackageId, scope.PipelineId, availability[index])).ToArray());
    }

    private InMemoryEventStore.BindingCommentStream CommentStream(string packageId, string pipelineId) {
        var bindingId = $"{packageId}::{pipelineId}";
        return new(packageId, pipelineId, bindingId, streams.GetStreamName(new PackageId(packageId)),
            streams.GetStreamName(new BindingId(bindingId)));
    }

    private static readonly SemaphoreSlim MutationGate = new(1, 1);

    /// <summary>Validates category defaults against saved pipeline streams and normalizes them to a distinct, sorted list.</summary>
    public async Task<string[]> ValidateAutomaticPipelineIdsAsync(IEnumerable<string> pipelineIds, CancellationToken cancellationToken) {
        var normalized = pipelineIds.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        foreach (var pipelineId in normalized) {
            if (string.IsNullOrWhiteSpace(pipelineId) || pipelineId.Length > 200 || pipelineId.Contains("::")) {
                throw new InvalidDataException("Each automatic pipeline ID must be a valid pipeline identifier.");
            }
            if (!await store.StreamExists(streams.GetStreamName(new PipelineId(pipelineId)), cancellationToken)) {
                throw new InvalidDataException($"Automatic pipeline '{pipelineId}' does not exist.");
            }
        }
        return normalized;
    }

    public async Task<BindingState> AssignAsync(string packageId, string pipelineId, CancellationToken cancellationToken, string? actor = null) {
        if (string.IsNullOrWhiteSpace(packageId) || string.IsNullOrWhiteSpace(pipelineId) || packageId.Contains("::") || pipelineId.Contains("::")) {
            throw new InvalidDataException("Supply valid package and pipeline identifiers.");
        }
        await MutationGate.WaitAsync(cancellationToken);
        try {
            if (!await store.StreamExists(streams.GetStreamName(new PackageId(packageId)), cancellationToken)) { throw new KeyNotFoundException("Package not found."); }
            if (!await store.StreamExists(streams.GetStreamName(new PipelineId(pipelineId)), cancellationToken)) { throw new KeyNotFoundException("Pipeline not found."); }
            var id = $"{packageId}::{pipelineId}";
            var exists = await store.StreamExists(streams.GetStreamName(new BindingId(id)), cancellationToken);
            if (exists) {
                var current = await GetAsync(id, cancellationToken);
                if (current.IsActive) { throw new PipelineAssignmentConflictException("Package is already assigned to this pipeline."); }
            }
            // New streams must not be loaded: ExpectedState.Any probes them by throwing
            // StreamNotFound, which interrupts startup when debugging thrown exceptions.
            var result = exists
                ? await commands.Handle(new DispatcherCommands.RestoreBinding(id, actor), cancellationToken)
                : await commands.Handle(new DispatcherCommands.Bind(id, packageId, pipelineId, actor), cancellationToken);
            if (result.Exception is WrongVersion) { throw new PipelineAssignmentConflictException("Assignment changed; retry the request."); }
            result.ThrowIfError();
            var saved = result.Get()!;
            assignments.Update(packageId, pipelineId, true, saved.GlobalPosition);
            return saved.State;
        }
        finally { MutationGate.Release(); }
    }

    public async Task RemoveAsync(string bindingId, CancellationToken cancellationToken, string? actor = null) {
        await MutationGate.WaitAsync(cancellationToken);
        try {
            var current = await GetAsync(bindingId, cancellationToken);
            if (!current.IsActive) { return; }
            var result = await commands.Handle(new DispatcherCommands.Unbind(bindingId, actor), cancellationToken);
            if (result.Exception is WrongVersion) { throw new PipelineAssignmentConflictException("Assignment changed; retry the request."); }
            result.ThrowIfError();
            assignments.Update(current.PackageId!.Value, current.PipelineId!.Value, false, result.Get()!.GlobalPosition);
        }
        finally { MutationGate.Release(); }
    }

    public async Task<BindingCommentResponse> AddCommentAsync(
        string packageId, string pipelineId, Guid operationId, string? text, string actor, CancellationToken cancellationToken) {
        ValidateCommentScopeId(packageId);
        ValidateCommentScopeId(pipelineId);
        ArgumentException.ThrowIfNullOrWhiteSpace(actor);
        var trimmed = text?.Trim();
        if (operationId == Guid.Empty || text is null || text.Length > MaximumCommentLength || string.IsNullOrEmpty(trimmed)) {
            throw new InvalidDataException($"Supply a nonempty operation ID and comment of 1 to {MaximumCommentLength} characters.");
        }

        await MutationGate.WaitAsync(cancellationToken);
        try {
            if (!await store.StreamExists(streams.GetStreamName(new PackageId(packageId)), cancellationToken)) {
                throw new KeyNotFoundException("Package not found.");
            }
            var bindingId = $"{packageId}::{pipelineId}";
            var binding = await GetAsync(bindingId, cancellationToken);
            if (binding.PackageId?.Value != packageId || binding.PipelineId?.Value != pipelineId) {
                throw new KeyNotFoundException("Binding not found.");
            }

            // The same gate coordinates assign, unbind and append. Resolve a retry before
            // testing activity so a recorded operation can be acknowledged after unbinding.
            var previous = store.ReadBindingComment(operationId, cancellationToken);
            if (previous is not null) {
                if (previous.PackageId != packageId || previous.PipelineId != pipelineId || previous.Text != trimmed ||
                    !string.Equals(previous.Actor, actor, StringComparison.OrdinalIgnoreCase)) {
                    throw new PipelineAssignmentConflictException("The comment operation ID is already in use.");
                }
                return MapComment(previous);
            }

            if (!binding.IsActive) { throw new PipelineAssignmentConflictException("The binding is inactive."); }

            // The existing-state command also checks activity and appends with its expected stream version.
            var result = await commands.Handle(new DispatcherCommands.AddBindingComment(bindingId, operationId, trimmed, actor), cancellationToken);
            if (result.Exception is WrongVersion) {
                throw new PipelineAssignmentConflictException("Assignment changed; check saved comments before retrying.");
            }
            result.ThrowIfError();
            var committed = store.ReadBindingComment(operationId, cancellationToken)
                ?? throw new InvalidOperationException("The committed binding comment could not be read.");
            return MapComment(committed);
        }
        finally { MutationGate.Release(); }
    }

    public BindingCommentPageResponse ListComments(string packageId, Guid? before, int pageSize, CancellationToken cancellationToken, string? pipelineId = null) {
        ValidateCommentScopeId(packageId);
        if (pipelineId is not null) { ValidateCommentScopeId(pipelineId); }
        ArgumentOutOfRangeException.ThrowIfLessThan(pageSize, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(pageSize, MaximumCommentPageSize);
        var events = pipelineId is null
            ? store.ReadPackageEvents(packageId, streams.GetStreamName(new PackageId(packageId)), cancellationToken)
                ?? throw new KeyNotFoundException("Package not found.")
            : store.ReadBindingCommentEvents(this.CommentStream(packageId, pipelineId), cancellationToken)
                ?? throw new KeyNotFoundException("Binding not found.");
        var ordered = events.Where(item => item.Payload is DispatcherEvents.V1.BindingCommentAdded comment && comment.PackageId == packageId)
            .Select(item => (EventId: item.Id, Comment: (DispatcherEvents.V1.BindingCommentAdded)item.Payload))
            .OrderByDescending(item => item.Comment.UTC).ThenByDescending(item => item.Comment.OperationId).ToArray();
        var offset = 0;
        if (before.HasValue) {
            offset = Array.FindIndex(ordered, item => item.Comment.OperationId == before.Value) + 1;
            if (offset == 0) {
                throw new InvalidDataException(pipelineId is null
                    ? "Comment continuation does not belong to this Package. Reload comments."
                    : "Comment continuation does not belong to this binding. Reload comments.");
            }
        }
        var page = ordered.Skip(offset).Take(pageSize).Select(item => MapComment(item.Comment) with { HistoryEventId = item.EventId }).ToArray();
        cancellationToken.ThrowIfCancellationRequested();
        return new BindingCommentPageResponse(packageId, page, offset + page.Length < ordered.Length ? page[^1].Id : null) { PipelineId = pipelineId };
    }

    private static BindingCommentResponse MapComment(DispatcherEvents.V1.BindingCommentAdded comment)
        => new(comment.OperationId, comment.PipelineId, comment.Text, comment.Actor, comment.UTC.ToUniversalTime());

    private static void ValidateCommentScopeId(string? id) {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 200 || id != id.Trim() || id.Contains("::") || id.Any(char.IsControl)) {
            throw new InvalidDataException("Supply valid package and pipeline identifiers.");
        }
    }

    public async Task<BindingState> GetAsync(string bindingId, CancellationToken cancellationToken) {
        if (!await store.StreamExists(streams.GetStreamName(new BindingId(bindingId)), cancellationToken)) { throw new KeyNotFoundException("Binding not found."); }
        return (await store.LoadState<BindingState, BindingId>(streams, new(bindingId), true, cancellationToken)).State;
    }

    public async Task<IReadOnlyList<BindingState>> ListAsync(string packageId, CancellationToken cancellationToken) {
        if (!await store.StreamExists(streams.GetStreamName(new PackageId(packageId)), cancellationToken)) { throw new KeyNotFoundException("Package not found."); }
        var result = new List<BindingState>();
        foreach (var pipeline in assignments.GetPipelines(packageId)) {
            var state = await GetAsync($"{packageId}::{pipeline}", cancellationToken);
            if (state.IsActive) { result.Add(state); }
        }
        return result;
    }
}
