namespace DataCatalague.Api.Models.V1;

/// <summary>Current directory information, not a historical snapshot. Actor is the recorded account.</summary>
public sealed record ActorProfileResponse(string Actor, string? DisplayName, string? PhotoMediaType, string? PhotoBase64);
