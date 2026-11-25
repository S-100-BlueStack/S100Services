using Hangfire;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.BackgroundProcessing.Scheduling;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Runs polling and authenticated reviews under the same distributed lock across API and Worker hosts.</summary>
public sealed class ValidationEmailService(ValidationEmailRepository repository, ValidationEmailProcessor processor, ValidationMailboxSynchronizer synchronizer, JobStorage storage, IOptions<ValidationEmailOptions> options, ILogger<ValidationEmailService> logger, IValidationEmailParser parser, IOptionsMonitor<SendToIcEncOptions>? sendOptions = null) : IValidationEmailInboxProcessor
{
    private bool ApplySimulation => options.Value.Mode == ValidationEmailMode.Simulation && sendOptions?.CurrentValue.Mode == SendToIcEncMode.Simulation;
    private const string LockName = "ProductCatalogue:ICENC-Email";

    /// <summary>Processes durable retries first, then captures at most twenty Graph pages per invocation.</summary>
    public async Task PollAsync(CancellationToken cancellationToken) {
        var settings = options.Value;
        if (settings.Mode == ValidationEmailMode.Disabled) return;
        using var connection = storage.GetConnection();
        using var gate = connection.AcquireDistributedLock(LockName, TimeSpan.FromSeconds(5));
        foreach (var id in await repository.PendingAsync(settings.Mode == ValidationEmailMode.Simulation, cancellationToken)) {
            ValidationEmailMessage? message = null;
            try {
                message = await repository.GetMessageAsync(id, cancellationToken);
                var review = await repository.GetPendingReviewAsync(id, cancellationToken);
                if (message is not null) {
                    var result = await processor.ProcessAsync(id, message, settings.DryRun, settings.ApplyReceivedAfterUtc, review, cancellationToken, ApplySimulation);
                    LogResult(id, result);
                    if (ApplySimulation && result.Status == "Review")
                        await repository.RecordWorkflowProcessingFailureAsync(message, cancellationToken);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception exception) {
                await repository.FailedAsync(id, cancellationToken);
                if (ApplySimulation && message is not null)
                    await repository.RecordWorkflowProcessingFailureAsync(message, cancellationToken);
                logger.LogWarning("External validation inbound processing requires retry. MessageId: {MessageId}. FailureType: {FailureType}", id, exception.GetType().Name);
            }
        }
        if (settings.Mode == ValidationEmailMode.Live && !await synchronizer.SynchronizeAsync(settings, cancellationToken))
            logger.LogWarning("Validation mailbox delta expired; the durable initial boundary will be replayed.");
    }

    /// <summary>Records an authenticated association and rechecks all filename, checksum and current revision constraints.</summary>
    public async Task<ValidationEmailProcessingResult?> ReviewAsync(Guid id, ValidationEmailReview review, string owner, CancellationToken cancellationToken) {
        using var connection = storage.GetConnection();
        using var gate = connection.AcquireDistributedLock(LockName, TimeSpan.FromSeconds(5));
        var message = await repository.GetMessageAsync(id, cancellationToken);
        if (message is null) return null;
        await repository.ReviewAsync(id, review, owner, cancellationToken);
        var result = await processor.ProcessAsync(id, message, options.Value.Mode != ValidationEmailMode.Live || options.Value.DryRun, options.Value.ApplyReceivedAfterUtc, review, cancellationToken, ApplySimulation);
        LogResult(id, result);
        return result;
    }

    /// <summary>Offline replay always uses dry-run, a separate identity namespace and an untrusted sender.</summary>
    public async Task<ValidationEmailProcessingResult> ReplayAsync(ValidationEmailMessage message, CancellationToken cancellationToken) {
        using var connection = storage.GetConnection();
        using var gate = connection.AcquireDistributedLock(LockName, TimeSpan.FromSeconds(5));
        var replay = message with { TrustedSender = false };
        // Offline input is never placed on the durable live retry queue.
        var parsed = parser.Parse(replay);
        var outgoing = parsed.CanMatch && parsed.FileName is not null ? await repository.FindOutgoingAsync(parsed.FileName, cancellationToken) : [];
        var match = ValidationEmailMatcher.Match(replay with { TrustedSender = true }, parsed, outgoing);
        return new("DryRun", match.Reason, parsed, match.File, replay.IsSimulation);
    }

    private void LogResult(Guid id, ValidationEmailProcessingResult result) => logger.LogInformation("External validation inbound result. MessageId: {MessageId}. DatasetFileName: {DatasetFileName}. CandidateId: {CandidateId}. TransmissionId: {TransmissionId}. Outcome: {Outcome}. Result: {Result}. Reason: {Reason}", id, result.Parsed.FileName, result.Match?.RevisionId, result.Match?.DeliveryId, result.Parsed.Outcome, result.Status, result.Reason);
}

/// <summary>Registers mailbox adapters, processing services and Worker schedule activation.</summary>
public static class ValidationEmailRegistrations
{
    /// <summary>Shares audit/review services with the API and starts scheduling only on Worker hosts.</summary>
    public static IServiceCollection AddValidationEmailProcessing(this IServiceCollection services, IConfiguration configuration, bool worker) {
        services.AddOptions<ValidationEmailOptions>().Configure(o => ValidationEmailOptions.BindSettings(configuration, o))
            .Validate(o => o.IsValid(), "Invalid ValidationEmail configuration or missing live rollout barrier.")
            .Validate<IOptionsMonitor<SendToIcEncOptions>>((o, send) => o.Mode != ValidationEmailMode.Live || o.DryRun || send.CurrentValue.Mode == SendToIcEncMode.Live, "ValidationEmail live processing requires SendToIcEnc:Mode=Live.")
            .ValidateOnStart();
        services.AddHttpClient("ValidationGraph", client => client.Timeout = TimeSpan.FromSeconds(60)).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false }).RemoveAllLoggers();
        services.AddSingleton<IValidationEmailParser, IcEncReportParser>();
        services.AddSingleton<IValidationMailbox, GraphValidationMailbox>();
        services.AddScoped<ValidationEmailRepository>();
        services.AddScoped<IValidationEmailStore>(provider => provider.GetRequiredService<ValidationEmailRepository>());
        services.AddScoped<IValidationEmailDecisionSink, IcEncAcknowledgementAdapter>();
        services.AddScoped<IValidationMailboxSyncStore>(provider => provider.GetRequiredService<ValidationEmailRepository>());
        services.AddScoped<ValidationMailboxSynchronizer>();
        services.AddScoped<ValidationEmailProcessor>();
        services.AddScoped<ValidationEmailService>();
        services.AddScoped<IValidationEmailInboxProcessor>(provider => provider.GetRequiredService<ValidationEmailService>());
        services.AddScoped<IValidationEmailSimulatedSend, ValidationEmailSimulatedSend>();
        services.AddScoped<IValidationEmailSimulationStore>(provider => provider.GetRequiredService<ValidationEmailRepository>());
        services.AddSingleton<IValidationEmailSimulationRandom, ValidationEmailSimulationRandom>();
        services.AddScoped<IValidationResponseGenerator, IcEncResponseGenerator>();
        services.AddScoped<IValidationEmailSimulationService>(provider => new ValidationEmailSimulationService(provider.GetRequiredService<IValidationEmailSimulationStore>(),
            provider.GetRequiredService<IValidationResponseGenerator>(), () => provider.GetRequiredService<IOptions<ValidationEmailOptions>>().Value.Mode, provider.GetRequiredService<TimeProvider>()));
        if (worker) {
            services.AddTransient<ProcessValidationMailboxJob>();
            services.AddHostedService<ValidationEmailSchedule>();
        }
        return services;
    }
}
