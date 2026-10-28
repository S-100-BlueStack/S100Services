using Hangfire.Client;
using Hangfire.Common;
using Hangfire.Server;
using Hangfire.Storage;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Allows at most one queued or running DPC invocation across Hangfire servers.</summary>
public sealed class CoalescingDpcFilter : JobFilterAttribute, IClientFilter, IServerFilter
{
    private const string GateKey = "enc-dpc-active-job";
    private const string GateLockKey = "enc-dpc-enqueue-lock";
    private const string JobIdField = "job-id";
    private const string ReservedAtField = "reserved-at";
    private const string ReservationItem = "enc-dpc-reservation";

    /// <summary>Cancels a new enqueue while a previous DPC job is queued or running.</summary>
    public void OnCreating(CreatingContext context) {
        if (!IsDpc(context.Job))
            return;

        using var gate = context.Connection.AcquireDistributedLock(GateLockKey, TimeSpan.FromSeconds(5));
        var values = context.Connection.GetAllEntriesFromHash(GateKey);
        var jobId = values?.GetValueOrDefault(JobIdField);
        var reservedAt = values?.GetValueOrDefault(ReservedAtField);

        if (!string.IsNullOrWhiteSpace(jobId)) {
            if (jobId.StartsWith("reserving:", StringComparison.Ordinal)) {
                if (DateTime.TryParse(reservedAt, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind, out var when) &&
                    DateTime.UtcNow - when < TimeSpan.FromMinutes(2)) {
                    context.Canceled = true;
                    return;
                }
            }
            else {
                var state = context.Connection.GetJobData(jobId)?.State;
                if (state is not null and not ("Succeeded" or "Failed" or "Deleted")) {
                    context.Canceled = true;
                    return;
                }
            }
        }

        var reservation = $"reserving:{Guid.NewGuid():N}";
        context.Connection.SetRangeInHash(GateKey, [
            new KeyValuePair<string, string>(JobIdField, reservation),
            new KeyValuePair<string, string>(ReservedAtField, DateTime.UtcNow.ToString("O", System.Globalization.CultureInfo.InvariantCulture))
        ]);
        context.Items[ReservationItem] = reservation;
    }

    /// <summary>Replaces this enqueue's reservation with its Hangfire job ID.</summary>
    public void OnCreated(CreatedContext context) {
        if (!IsDpc(context.Job) || !context.Items.TryGetValue(ReservationItem, out var item) || item is not string reservation)
            return;

        using var gate = context.Connection.AcquireDistributedLock(GateLockKey, TimeSpan.FromSeconds(5));
        var currentJobId = context.Connection.GetAllEntriesFromHash(GateKey)?.GetValueOrDefault(JobIdField);
        if (currentJobId == reservation)
            context.Connection.SetRangeInHash(GateKey, [new KeyValuePair<string, string>(JobIdField, context.BackgroundJob?.Id ?? string.Empty)]);
    }

    /// <summary>Leaves the enqueue gate in place while the DPC job runs.</summary>
    public void OnPerforming(PerformingContext context) { }

    /// <summary>Releases the enqueue gate when this DPC invocation finishes.</summary>
    public void OnPerformed(PerformedContext context) {
        if (!IsDpc(context.BackgroundJob.Job))
            return;

        using var gate = context.Connection.AcquireDistributedLock(GateLockKey, TimeSpan.FromSeconds(5));
        var currentJobId = context.Connection.GetAllEntriesFromHash(GateKey)?.GetValueOrDefault(JobIdField);
        if (currentJobId == context.BackgroundJob.Id)
            context.Connection.SetRangeInHash(GateKey, [new KeyValuePair<string, string>(JobIdField, string.Empty)]);
    }

    private static bool IsDpc(Job job) => job.Type == typeof(DetectProductChangesJob) && job.Method.Name == nameof(DetectProductChangesJob.RunAsync);
}