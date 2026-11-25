using Hangfire.Server;
using Hangfire;

namespace ProductCatalogueAPI.BackgroundProcessing.Execution;

/// <summary>Reads and writes durable execution metadata without requiring a Hangfire method invocation.</summary>
/// <remarks>The standalone validation-email test project links this source file.</remarks>
public interface IExportJobExecutionContext
{
    /// <summary>Stable background job identifier, also used to deduplicate simulated email responses.</summary>
    string JobId { get; }
    /// <summary>Reads an existing typed job parameter.</summary>
    T? GetJobParameter<T>(string name);
    /// <summary>Writes or clears a job parameter through the owning execution adapter.</summary>
    void SetJobParameter(string name, object? value);
}

/// <summary>Bridges durable execution metadata to Hangfire for export and delivery.</summary>
internal sealed class HangfireExportJobExecutionContext(PerformContext context) : IExportJobExecutionContext
{
    /// <inheritdoc/>
    public string JobId => context.BackgroundJob.Id;

    /// <inheritdoc/>
    public T? GetJobParameter<T>(string name) => context.GetJobParameter<T>(name);

    /// <inheritdoc/>
    public void SetJobParameter(string name, object? value) => context.SetJobParameter(name, value!);
}
