using Hangfire;
using Hangfire.Common;
using ProductCatalogueAPI.Jobs;

namespace ProductCatalogueAPI.Services.History;

public sealed record ProductHistoryJobState(
    string State, ExportOperationJobRequest Request, Guid OperationId,
    string DatasetName, string ExportTarget, string OperationType, string CorrelationId,
    bool? ExecutionStarted, ProductHistoryTerminal? Terminal);

public interface IProductHistoryJobReader
{
    ProductHistoryJobState? Read(string jobId);
}

/// <summary>Reads the current state, never guesses it from timestamp-sorted monitoring history.</summary>
public sealed class ProductHistoryJobReader(JobStorage storage) : IProductHistoryJobReader
{
    public ProductHistoryJobState? Read(string jobId) {
        using var connection = storage.GetConnection();
        var job = connection.GetJobData(jobId);
        var state = connection.GetStateData(jobId);
        if (job?.Job?.Type != typeof(ExportOperationJob) || job.Job.Method.Name != nameof(ExportOperationJob.RunAsync) || state is null) return null;
        var request = job.Job.Args.OfType<ExportOperationJobRequest>().SingleOrDefault();
        if (request is null) return null;
        var result = new ProductHistoryJobState(state.Name, request,
            ReadParameter<Guid>(connection.GetJobParameter(jobId, ExportJobParameterNames.OperationId)),
            ReadParameter<string>(connection.GetJobParameter(jobId, ExportJobParameterNames.DatasetName)) ?? string.Empty,
            ReadParameter<string>(connection.GetJobParameter(jobId, ExportJobParameterNames.ExportTarget)) ?? string.Empty,
            ReadParameter<string>(connection.GetJobParameter(jobId, ExportJobParameterNames.OperationType)) ?? string.Empty,
            ReadParameter<string>(connection.GetJobParameter(jobId, ExportJobParameterNames.CorrelationId)) ?? string.Empty,
            ReadParameter<bool?>(connection.GetJobParameter(jobId, ExportJobParameterNames.ExecutionStarted)),
            ReadParameter<ProductHistoryTerminal>(connection.GetJobParameter(jobId, ExportJobParameterNames.HistoryTerminal)));
        // Dashboard transitions may occur without acquiring the Product lock. A changed
        // state is inconclusive and will be observed again during the next sweep.
        return connection.GetStateData(jobId)?.Name == state.Name ? result : null;
    }

    private static T? ReadParameter<T>(string? value) => value is null ? default : JobHelper.FromJson<T>(value);
}
