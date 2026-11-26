namespace DataCatalague.Api.Models.V1;

public sealed record PackageDiscardRequest(Guid OperationId, bool? Discarded, string? Reason);
