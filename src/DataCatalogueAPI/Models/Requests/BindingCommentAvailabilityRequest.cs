namespace DataCatalague.Api.Models.V1;

public sealed record BindingCommentAvailabilityRequest(BindingCommentScope?[]? Bindings);

public sealed record BindingCommentScope(string? PackageId, string? PipelineId);
