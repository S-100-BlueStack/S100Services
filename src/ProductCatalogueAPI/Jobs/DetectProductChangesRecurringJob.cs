using Hangfire;
using System.Linq.Expressions;

namespace ProductCatalogueAPI.Jobs
{
    internal static class DetectProductChangesRecurringJob
    {
        internal const string RecurringJobId = "detect-product-changes-job";

        public static void Reconcile(DetectProductChangesState state, IServiceProvider services, ILogger logger) => Reconcile(
            state,
            logger,
            // Resolve inside the delegates so activation/storage failures use the same safe boundary.
            (id, invocation, cron) => services.GetRequiredService<IRecurringJobManager>().AddOrUpdate(id, invocation, cron),
            id => services.GetRequiredService<IRecurringJobManager>().RemoveIfExists(id)
        );

        // Keep storage interaction replaceable without starting a Hangfire server in contract tests.
        internal static void Reconcile(
            DetectProductChangesState state,
            ILogger logger,
            Action<string, Expression<Func<DetectProductChangesJob, Task>>, string> addOrUpdate,
            Action<string> removeIfExists
        ) {
            try {
                if (state.Enabled)
                    addOrUpdate(RecurringJobId, job => job.RunAsync(CancellationToken.None), Cron.Daily(23));
                else
                    removeIfExists(RecurringJobId);
            }
            catch (Exception exception) {
                logger.LogError(exception, "DetectProductChanges recurring-job reconciliation failed.");
                // Match the startup boundary: technical detail stays in server diagnostics.
                throw new InvalidOperationException(
                    "DETECT_PRODUCT_CHANGES_RECONCILIATION_FAILED: Product change detection recurring-job reconciliation failed."
                );
            }

            logger.LogInformation(
                "DetectProductChanges recurring-job reconciliation completed. Enabled: {Enabled}.",
                state.Enabled
            );
        }
    }
}
