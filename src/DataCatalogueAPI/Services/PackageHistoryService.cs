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

    private static PackageHistoryEventResponse? Map(StreamEvent item, string packageId) {
        // Existing event contracts contain no actor. The current request identity is not
        // the historical actor, and Workspace locks do not establish Package progress.
        PackageHistoryEventResponse Entry(string type, DateTimeOffset utc, string? pipelineId = null, string? severity = null)
            => new(item.Id, type, utc.ToUniversalTime(), null, pipelineId, null, severity);

        return item.Payload switch {
            PackagesEvents.V1.PackageCreated created when created.PackageId == packageId => Entry("packageCreated", created.UTC),
            PackagesEvents.V1.SeverityUpdated updated => Entry("severityUpdated", updated.UTC, severity: updated.Severity.ToString(CultureInfo.InvariantCulture)),
            PackagesEvents.V1.DetailedGeometryAdded added => Entry("detailedGeometryAdded", added.UTC),
            PackagesEvents.V1.GeometryReplaced replaced => Entry("geometryReplaced", replaced.UTC),
            DispatcherEvents.V1.Binded bound when bound.PackageId == packageId => Entry("pipelineAssigned", bound.UTC, bound.PipelineId),
            DispatcherEvents.V1.Unbound unbound when unbound.PackageId == packageId => Entry("pipelineUnassigned", unbound.UTC, unbound.PipelineId),
            _ => null,
        };
    }
}
