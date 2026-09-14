using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.ExportRules;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Jobs;

/// <summary>
/// Evaluates open summaries and builds independent product-track exports in parallel. Registration does not schedule this job.
/// </summary>
public sealed class ProcessChangeSummariesJob(IProductWorkflowRepository workflowRepository, IExportDecisionRuleSetRegistry ruleSets, IExportOperationService exportOperations, IDatasetLockService datasetLockService, TimeProvider timeProvider, ILogger<ProcessChangeSummariesJob> logger) : IBackgroundJob
{
    private readonly IProductWorkflowRepository _workflowRepository = workflowRepository;
    private readonly IExportDecisionRuleSetRegistry _ruleSets = ruleSets;
    private readonly IExportOperationService _exportOperations = exportOperations;
    private readonly IDatasetLockService _datasetLockService = datasetLockService;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<ProcessChangeSummariesJob> _logger = logger;

    /// <inheritdoc/>
    public async Task RunAsync(CancellationToken cancellationToken) {
        var summaries = await _workflowRepository.GetOpenChangeSummariesAsync(cancellationToken);
        await Task.WhenAll(summaries.Select(summary => ProcessSummaryAsync(summary, cancellationToken)));
    }

    private async Task ProcessSummaryAsync(Data.Models.ProductChangeSummary summary, CancellationToken cancellationToken) {
        var decision = _ruleSets.GetRequired(summary.ProductSpecification).Evaluate(summary);
        if (!decision.RevisionType.HasValue) {
            _logger.LogInformation("Change-summary export deferred by ruleset. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. Reason: {Reason}.", summary.DatasetName, summary.ProductSpecification, decision.Reason);
            return;
        }

        await using var datasetLock = await _datasetLockService.TryAcquireAsync($"{summary.DatasetName}-{summary.ProductSpecification}", cancellationToken);
        if (datasetLock is null) {
            _logger.LogWarning("Change-summary export skipped because its independent track lock is held. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}.", summary.DatasetName, summary.ProductSpecification);
            return;
        }

        // Freezing is an intentional operator hold, so defer this summary without failing the batch.
        var track = await _workflowRepository.GetTrackAsync(summary.DatasetName, summary.ProductSpecification, cancellationToken);
        if (track?.State == ProductState.Frozen) {
            _logger.LogInformation("Change-summary export deferred because the product track is frozen. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. TrackId: {TrackId}.", summary.DatasetName, summary.ProductSpecification, summary.TrackId);
            return;
        }

        try {
            await _exportOperations.ExecuteExportAsync(summary.DatasetName, decision.RevisionType.Value, "system", summary.Yaml, cancellationToken);
        }
        catch (ExportOperationRejectedException) {
            var currentTrack = await _workflowRepository.GetTrackAsync(summary.DatasetName, summary.ProductSpecification, cancellationToken);
            if (currentTrack?.State != ProductState.Frozen)
                throw;

            _logger.LogInformation("Change-summary export deferred because the product track became frozen during processing. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. TrackId: {TrackId}.", summary.DatasetName, summary.ProductSpecification, summary.TrackId);
            return;
        }

        await _workflowRepository.CloseChangeSummaryAsync(summary.Id, _timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
    }
}
