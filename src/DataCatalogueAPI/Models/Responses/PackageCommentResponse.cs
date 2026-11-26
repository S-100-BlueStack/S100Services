namespace DataCatalague.Api.Models.V1;

public sealed record PackageOperationResponse(
    Guid Id, Guid HistoryEventId, string Kind, string? Text, string Actor, DateTimeOffset OccurredAtUtc)
{
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? AssignmentStatus { get; init; }
}

public sealed record PackageCommentPageResponse(
    string PackageId, IReadOnlyList<PackageOperationResponse> Items, Guid? NextBefore);
