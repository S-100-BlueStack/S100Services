namespace DataCatalague.Api.Models.V1;

/// <summary>An immutable comment from a Package–Pipeline binding stream.</summary>
public sealed record BindingCommentResponse(Guid Id, string PipelineId, string Text, string Actor, DateTimeOffset OccurredAtUtc);

/// <summary>A bounded page of retained comments from active and inactive bindings for one Package.</summary>
public sealed record BindingCommentPageResponse(string PackageId, IReadOnlyList<BindingCommentResponse> Items, Guid? NextBefore);
