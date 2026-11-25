using System.Globalization;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Events;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;

namespace DataCatalague.Api.Services;

/// <summary>Projects committed package and binding events without exposing their raw payloads.</summary>
public sealed class PackageHistoryService(InMemoryEventStore store, StreamNameMap streams, IPipelineRepository pipelines)
{
    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;

    public async Task<PackageHistoryResponse?> GetAsync(string packageId, Guid? before, int pageSize, CancellationToken cancellationToken) {
        ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        ArgumentOutOfRangeException.ThrowIfLessThan(pageSize, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(pageSize, MaximumPageSize);
        var events = store.ReadPackageEvents(packageId, streams.GetStreamName(new PackageId(packageId)), cancellationToken);
        if (events is null || !events.Any(item => item.Payload is PackagesEvents.V1.PackageCreated created && created.PackageId == packageId)) { return null; }

        // Domain timestamps reflect the operation order even when creation and automatic
        // binding streams are committed in a different order within one atomic append.
        var ordered = events.Select(item => (Event: item, History: Map(item, packageId)))
            .Where(item => item.History is not null)
            .OrderByDescending(item => item.History!.OccurredAtUtc)
            .ThenByDescending(item => (ulong)item.Event.Revision)
            .ThenByDescending(item => item.History!.Id)
            .Select(item => item.History!).ToArray();
        var offset = 0;
        if (before.HasValue) {
            var cursorIndex = Array.FindIndex(ordered, item => item.Id == before.Value);
            if (cursorIndex < 0) { throw new InvalidDataException("History continuation does not belong to the current Package history. Reload history."); }
            offset = cursorIndex + 1;
        }
        var page = ordered.Skip(offset).Take(pageSize).ToArray();
        if (page.Any(item => item.PipelineId is not null)) {
            var names = (await pipelines.GetPipelinesAsync(cancellationToken)).ToDictionary(item => item.Id!.Value, item => item.DisplayName, StringComparer.Ordinal);
            page = page.Select(item => item.PipelineId is not null && names.TryGetValue(item.PipelineId, out var name)
                ? item with { PipelineName = name } : item).ToArray();
        }
        cancellationToken.ThrowIfCancellationRequested();
        return new PackageHistoryResponse(packageId, page, offset + page.Length < ordered.Length ? page[^1].Id : null);
    }

    /// <summary>Resolves the actor of an actual history event; no caller-provided account is trusted.</summary>
    public PackageHistoryEventResponse? FindEvent(string packageId, Guid eventId, CancellationToken cancellationToken) {
        var events = store.ReadPackageEvents(packageId, streams.GetStreamName(new PackageId(packageId)), cancellationToken);
        if (events is null || !events.Any(item => item.Payload is PackagesEvents.V1.PackageCreated created && created.PackageId == packageId)) { return null; }
        foreach (var item in events) {
            cancellationToken.ThrowIfCancellationRequested();
            if (item.Id == eventId) { return Map(item, packageId); }
        }
        return null;
    }

    private static PackageHistoryEventResponse? Map(StreamEvent item, string packageId) {
        // The original committed event is authoritative; the current request identity
        // and current Workspace ownership must never be used to fill missing actors.
        PackageHistoryEventResponse Entry(string type, DateTimeOffset utc, string? actor, string? pipelineId = null, string? severity = null)
            => new(item.Id, type, utc.ToUniversalTime(), actor, pipelineId, null, severity);

        return item.Payload switch {
            PackagesEvents.V1.PackageCreated created when created.PackageId == packageId => Entry("packageCreated", created.UTC, created.Actor),
            PackagesEvents.V1.SeverityUpdated updated => Entry("severityUpdated", updated.UTC, updated.Actor, severity: updated.Severity.ToString(CultureInfo.InvariantCulture)),
            PackagesEvents.V1.DetailedGeometryAdded added => Entry("detailedGeometryAdded", added.UTC, added.Actor),
            PackagesEvents.V1.GeometryReplaced replaced => Entry("geometryReplaced", replaced.UTC, replaced.Actor),
            DispatcherEvents.V1.Binded bound when bound.PackageId == packageId => Entry("pipelineAssigned", bound.UTC, bound.Actor, bound.PipelineId),
            DispatcherEvents.V1.Unbound unbound when unbound.PackageId == packageId => Entry("pipelineUnassigned", unbound.UTC, unbound.Actor, unbound.PipelineId),
            _ => null,
        };
    }
}
