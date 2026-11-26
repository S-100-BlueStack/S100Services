using DataCatalague.Api.Domain;
using System.Collections.Concurrent;

namespace DataCatalague.Api.Repositories;

/// <summary>Tracks active assignment pairs and ignores delayed projection updates.</summary>
public sealed class PipelineAssignmentIndex
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Assignment> _decisions = new(StringComparer.Ordinal);

    internal void UpdateDecision(string packageId, bool discarded, ulong position) {
        lock (this._gate) {
            if (!this._decisions.TryGetValue(packageId, out var current) || position > current.Position) {
                this._decisions[packageId] = new(discarded, position);
            }
        }
    }

    internal PackageAssignmentSnapshot GetSnapshot(string packageId) {
        lock (this._gate) {
            return new(this.GetPipelines(packageId), this._decisions.TryGetValue(packageId, out var decision) && decision.Active);
        }
    }

    private sealed record Assignment(bool Active, ulong Position);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, Assignment>> _packages = new(StringComparer.Ordinal);

    internal void Update(string packageId, string pipelineId, bool active, ulong position) {
        lock (this._gate) {
            var pipelines = _packages.GetOrAdd(packageId, _ => new(StringComparer.Ordinal));
            var update = new Assignment(active, position);
            pipelines.AddOrUpdate(pipelineId, update, (_, current) => position > current.Position ? update : current);
        }
    }

    internal bool Contains(string packageId, string pipelineId) => _packages.TryGetValue(packageId, out var pipelines) && pipelines.TryGetValue(pipelineId, out var assignment) && assignment.Active;
    internal bool HasAssignments(string packageId) => _packages.TryGetValue(packageId, out var pipelines) && pipelines.Values.Any(value => value.Active);
    internal string[] GetPipelines(string packageId) => _packages.TryGetValue(packageId, out var pipelines)
        ? pipelines.Where(pair => pair.Value.Active).Select(pair => pair.Key).Order(StringComparer.Ordinal).ToArray() : [];
}
