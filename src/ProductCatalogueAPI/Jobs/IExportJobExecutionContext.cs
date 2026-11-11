namespace ProductCatalogueAPI.Jobs;

/// <summary>Provides job metadata independently of Hangfire activation and ArcGIS execution.</summary>
public interface IExportJobExecutionContext
{
    /// <summary>Stable background job identifier, also used to deduplicate simulated email responses.</summary>
    string JobId { get; }
    /// <summary>Reads an existing typed job parameter.</summary>
    T? GetJobParameter<T>(string name);
    /// <summary>Writes or clears a job parameter through the owning execution adapter.</summary>
    void SetJobParameter(string name, object? value);
}
