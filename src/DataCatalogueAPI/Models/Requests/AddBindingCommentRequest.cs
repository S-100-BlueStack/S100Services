namespace DataCatalague.Api.Models.V1;

/// <summary>The canonical pipeline, retry identifier and plain text for a new binding comment.</summary>
public sealed record AddBindingCommentRequest(string PipelineId, Guid OperationId, string? Text);
