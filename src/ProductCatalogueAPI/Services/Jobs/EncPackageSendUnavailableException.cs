namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>An obsolete or duplicate queued request lost eligibility; it must not mark the current package as a failed send.</summary>
public sealed class EncPackageSendUnavailableException() : InvalidOperationException("The package changed, is paused, already sent, failed or does not contain two Ready candidates.")
{
}
