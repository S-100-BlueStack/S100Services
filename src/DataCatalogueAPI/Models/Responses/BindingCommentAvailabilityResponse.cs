using System.Text.Json.Serialization;

namespace DataCatalague.Api.Models.V1;

public sealed record BindingCommentAvailabilityItem(
    string PackageId,
    string PipelineId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] bool? HasBindingComments);

public sealed record BindingCommentAvailabilityResponse(IReadOnlyList<BindingCommentAvailabilityItem> Items);
