namespace ProductCatalogueAPI.BackgroundProcessing.Execution;

/// <summary>Exposes the stable failure code and safe message for a failed IC-ENC send job.</summary>
/// <param name="code">Stable code stored with the job status.</param>
/// <param name="message">Operator-facing description of the failure.</param>
public sealed class SendToIcEncJobException(string code, string message)
    : Exception($"{code}: {message}")
{
    /// <summary>Identifies the failure independently of the message text.</summary>
    public string Code { get; } = code;
}
