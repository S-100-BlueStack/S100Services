namespace ProductCatalogueAPI.BackgroundProcessing;

/// <summary>Defines the cancellation-aware entry point of a background job without a request payload.</summary>
public interface IBackgroundJob
{
    /// <summary>Runs one job invocation.</summary>
    /// <param name="cancellationToken">Cancellation requested by the job host.</param>
    /// <returns>A task that completes after the invocation finishes.</returns>
    Task RunAsync(CancellationToken cancellationToken);
}
