namespace ProductCatalogueAPI.Services.Operations;

/// <summary>Carries the safe result and execution classification for a failed export job.</summary>
/// <param name="code">Stable failure code for the status and history contracts.</param>
/// <param name="message">Safe failure description.</param>
public sealed class ExportOperationJobException(string code, string message)
    : Exception($"{code}: {message}")
{
    public string Code { get; } = code;
    /// <summary>Preserves expected validation severity when a package exception is mapped to a safe public job failure.</summary>
    public bool IsValidationFindingFailure { get; init; }
    // Set only by the execution owner when the service rejected before its mutation hook.
    public bool IsPreExecutionRejection { get; init; }
}
