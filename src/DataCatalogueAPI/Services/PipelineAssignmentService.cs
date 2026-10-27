using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Repositories;
using Eventuous;

namespace DataCatalague.Api.Services;

public sealed class PipelineAssignmentConflictException(string message) : Exception(message);

/// <summary>Changes package routing while retaining assignment event history.</summary>
public sealed class PipelineAssignmentService(IEventStore store, StreamNameMap streams, ICommandService<BindingState> commands, PipelineAssignmentIndex assignments)
{
    private static readonly SemaphoreSlim MutationGate = new(1, 1);

    public async Task<BindingState> AssignAsync(string packageId, string pipelineId, CancellationToken cancellationToken) {
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
                ? await commands.Handle(new DispatcherCommands.RestoreBinding(id), cancellationToken)
                : await commands.Handle(new DispatcherCommands.Bind(id, packageId, pipelineId), cancellationToken);
            if (result.Exception is WrongVersion) { throw new PipelineAssignmentConflictException("Assignment changed; retry the request."); }
            result.ThrowIfError();
            var saved = result.Get()!;
            assignments.Update(packageId, pipelineId, true, saved.GlobalPosition);
            return saved.State;
        }
        finally { MutationGate.Release(); }
    }

    public async Task RemoveAsync(string bindingId, CancellationToken cancellationToken) {
        await MutationGate.WaitAsync(cancellationToken);
        try {
            var current = await GetAsync(bindingId, cancellationToken);
            if (!current.IsActive) { return; }
            var result = await commands.Handle(new DispatcherCommands.Unbind(bindingId), cancellationToken);
            if (result.Exception is WrongVersion) { throw new PipelineAssignmentConflictException("Assignment changed; retry the request."); }
            result.ThrowIfError();
            assignments.Update(current.PackageId!.Value, current.PipelineId!.Value, false, result.Get()!.GlobalPosition);
        }
        finally { MutationGate.Release(); }
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
