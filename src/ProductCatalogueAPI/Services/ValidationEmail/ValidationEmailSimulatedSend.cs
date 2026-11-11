using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Options;
using Microsoft.Extensions.Options;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Exercises candidate reservation and acknowledgement without contacting external services.</summary>
public sealed class ValidationEmailSimulatedSend(IIcEncDeliveryRepository deliveries, IValidationEmailSimulationStore store, IValidationResponseGenerator generator, IValidationEmailInboxProcessor mailbox, IOptionsMonitor<SendToIcEncOptions> sendOptions, IOptions<ValidationEmailOptions> emailOptions, TimeProvider clock) : IValidationEmailSimulatedSend
{
    /// <inheritdoc/>
    public bool Enabled => sendOptions.CurrentValue.Mode == SendToIcEncMode.Simulation && emailOptions.Value.Mode == ValidationEmailMode.Simulation;

    /// <inheritdoc/>
    public async Task SendAsync(SendToIcEncJobRequest request, string jobId, CancellationToken cancellationToken) {
        if (!Enabled || request.Mode != SendToIcEncMode.Simulation)
            throw new InvalidOperationException("Simulated workflow requires both delivery and email Simulation modes.");
        if (!Enum.TryParse<ProductSpecification>(request.ProductSpecification, out var specification) || specification is not (ProductSpecification.S57 or ProductSpecification.S101))
            throw new ArgumentException("Simulation requires an exact S57 or S101 candidate.", nameof(request));
        var delivery = await deliveries.ReserveSimulationAsync(request.DatasetName, specification, request.ExpectedEdition, request.ExpectedUpdate, jobId, clock.GetUtcNow().UtcDateTime, cancellationToken, request.PackageId, request.ExpectedRevisionId)
            ?? throw new InvalidOperationException("The simulation candidate changed, is paused or is no longer ready.");
        // Complete the simulated send before exposing its notice to the durable mailbox queue.
        // Reservation and captured notice are replayable if the host stops between these operations.
        await deliveries.MarkDeliveredAsync(delivery.Id, clock.GetUtcNow().UtcDateTime, cancellationToken);
        var key = "workflow-send:" + jobId;
        var existing = await store.FindSimulationAsync(key, cancellationToken);
        if (existing is not null && (existing.Message.SimulatedOutgoingFile?.DeliveryId != delivery.Id || !existing.Message.SimulationWorkflow))
            throw new InvalidOperationException("The simulation job key belongs to another captured send.");
        if (existing is null) {
            var candidate = new ValidationSimulationCandidate(delivery.RevisionId, delivery.TrackId, delivery.DatasetName, specification.ToString(), delivery.Edition, delivery.Update, delivery.ExchangeSet);
            var generated = generator.Generate(candidate, key, clock.GetUtcNow());
            var file = generated.SimulatedOutgoingFile! with { DeliveryId = delivery.Id, SentAtUtc = delivery.ReservedAtUtc, IsSimulation = true };
            await store.SaveSimulationAsync(key, generated with { SimulatedOutgoingFile = file, SimulationWorkflow = true }, cancellationToken);
        }
        // Uses the same distributed lock and processor as the minute-based recovery job.
        await mailbox.PollAsync(cancellationToken);
    }
}
