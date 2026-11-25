namespace DataCatalague.Api.Models.V1;

/// <summary>A bounded, newest-first page of recorded events for one canonical package.</summary>
public sealed record PackageHistoryResponse(string PackageId, IReadOnlyList<PackageHistoryEventResponse> Items, Guid? NextBefore);

/// <summary>A safe history projection. Actor is null when the stored event did not record one.</summary>
/// <param name="Id">The stored event identifier, also used as the continuation cursor.</param>
/// <param name="EventType">The application history event type, not the serialized event-store type.</param>
/// <param name="OccurredAtUtc">The timestamp recorded by the domain event.</param>
/// <param name="Actor">The recorded Windows account, System for explicitly identified internal initialization, or null when unknown.</param>
/// <param name="PipelineId">The related pipeline identifier for binding events only.</param>
/// <param name="PipelineName">The current pipeline display name when available; not a historical name.</param>
/// <param name="Severity">The exact unsigned decimal severity for severity events only.</param>
public sealed record PackageHistoryEventResponse(Guid Id, string EventType, DateTimeOffset OccurredAtUtc, string? Actor, string? PipelineId, string? PipelineName, string? Severity);
