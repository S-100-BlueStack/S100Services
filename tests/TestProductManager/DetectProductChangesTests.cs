using Hangfire;
using Hangfire.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC.ProductCatalogue;
using System.Linq.Expressions;
using System.Reflection;

namespace TestProductCatalogueAPI
{
    public sealed class DetectProductChangesTests
    {
        [Fact]
        public void MissingDetectionFlagDefaultsToDisabled() {
            Assert.False(DetectProductChangesState.FromConfiguration(new ConfigurationManager()).Enabled);
        }

        [Theory]
        [InlineData("false", false)]
        [InlineData("true", true)]
        public void ValidDetectionFlagResolvesStartupDecision(string value, bool expected) {
            Assert.Equal(expected, State(value).Enabled);
        }

        [Theory]
        [InlineData("")]
        [InlineData(" ")]
        [InlineData("1")]
        [InlineData("enabled")]
        [InlineData("sensitive-invalid-value")]
        public void InvalidDetectionFlagCannotEnableExecution(string value) {
            var exception = Assert.Throws<InvalidOperationException>(() => State(value));
            Assert.Equal(
                "DETECT_PRODUCT_CHANGES_CONFIGURATION_INVALID: Product change detection configuration must be a Boolean value.",
                exception.Message
            );
            Assert.Null(exception.InnerException);
        }

        [Fact]
        public void DisabledDetectionRemovesRecurringDefinition() {
            var schedule = new RecordingSchedule();
            schedule.Definitions.Add("detect-product-changes-job");

            Reconcile(State("false"), schedule);

            Assert.Equal(new[] { "detect-product-changes-job" }, schedule.Removals);
            Assert.Empty(schedule.Definitions);
            Assert.Empty(schedule.Registrations);
        }

        [Fact]
        public void RepeatedDetectionReconciliationIsIdempotent() {
            var schedule = new RecordingSchedule();
            Reconcile(State("true"), schedule);
            Reconcile(State("false"), schedule);
            Reconcile(State("false"), schedule);

            Assert.Empty(schedule.Definitions);
            Assert.Equal(new[] { "detect-product-changes-job", "detect-product-changes-job" }, schedule.Removals);
            Assert.Single(schedule.Registrations);
        }

        [Fact]
        public void EnabledDetectionPreservesRecurringContract() {
            var schedule = new RecordingSchedule();
            Reconcile(State("true"), schedule);

            var registration = Assert.Single(schedule.Registrations);
            Assert.Equal("detect-product-changes-job", registration.Id);
            Assert.Equal("0 23 * * *", registration.Cron);
            var invocation = Job.FromExpression(registration.Invocation);
            Assert.Equal(typeof(DetectProductChangesJob), invocation.Type);
            Assert.Equal("RunAsync", invocation.Method.Name);
            Assert.True(invocation.Method.IsPublic);
            Assert.Equal(typeof(Task), invocation.Method.ReturnType);
            Assert.Equal(typeof(CancellationToken), Assert.Single(invocation.Method.GetParameters()).ParameterType);
            Assert.Equal(CancellationToken.None, Assert.IsType<CancellationToken>(Assert.Single(invocation.Args)));
            Assert.Empty(schedule.Removals);
        }

        [Theory]
        [InlineData("false")]
        [InlineData("true")]
        public void ReconciliationFailurePreventsSuccessfulStartup(string value) {
            var technicalException = new InvalidOperationException("sensitive-storage-detail");
            var schedule = new RecordingSchedule { Failure = technicalException };
            var logger = new RecordingLogger();
            var startupContinued = false;

            var exception = Assert.Throws<InvalidOperationException>(() => {
                Reconcile(State(value), schedule, logger);
                startupContinued = true;
            });

            Assert.False(startupContinued);
            Assert.Equal(
                "DETECT_PRODUCT_CHANGES_RECONCILIATION_FAILED: Product change detection recurring-job reconciliation failed.",
                exception.Message
            );
            Assert.Null(exception.InnerException);
            var diagnostic = Assert.Single(logger.Entries);
            Assert.Equal(LogLevel.Error, diagnostic.Level);
            Assert.Same(technicalException, diagnostic.Exception);
            Assert.Empty(schedule.Definitions);
        }

        [Fact]
        public async Task DisabledInvocationDoesNotAccessDependencies() {
            var calls = new List<string>();
            var job = CreateJob(State("false"), calls);

            var exception = await Assert.ThrowsAsync<DetectProductChangesDisabledException>(() =>
                job.RunAsync(CancellationToken.None)
            );

            Assert.Equal("DETECT_PRODUCT_CHANGES_DISABLED", exception.Code);
            Assert.Equal(
                "DETECT_PRODUCT_CHANGES_DISABLED: Product change detection is disabled by application configuration.",
                exception.Message
            );
            Assert.Empty(calls);
        }

        [Fact]
        public async Task DisabledLegacyInvocationUsesCurrentExecutionGuard() {
            // Persisted invocations identify the job type and public method, not its constructor.
            var legacyInvocation = Job.FromExpression<DetectProductChangesJob>(job => job.RunAsync(CancellationToken.None));
            var calls = new List<string>();
            var currentJob = CreateJob(State("false"), calls);

            await Assert.ThrowsAsync<DetectProductChangesDisabledException>(() =>
                (Task)legacyInvocation.Method.Invoke(currentJob, legacyInvocation.Args.ToArray())!
            );

            Assert.Empty(calls);
        }

        [Theory]
        [InlineData(false)]
        [InlineData(true)]
        public async Task DetectionExecutionUsesStartupSnapshot(bool initiallyEnabled) {
            var configuration = new ConfigurationManager();
            configuration["EnableDetectProductChanges"] = initiallyEnabled.ToString();
            var state = DetectProductChangesState.FromConfiguration(configuration);
            configuration["EnableDetectProductChanges"] = (!initiallyEnabled).ToString();
            var schedule = new RecordingSchedule();
            Reconcile(state, schedule);
            var calls = new List<string>();
            var job = CreateJob(state, calls);

            if (initiallyEnabled) {
                await Assert.ThrowsAsync<DependencyAccessException>(() => job.RunAsync(CancellationToken.None));
                Assert.Equal(new[] { "IProductRepository.GetLastSuccessfulRunUtcAsync" }, calls);
                Assert.Single(schedule.Registrations);
                Assert.Empty(schedule.Removals);
            }
            else {
                await Assert.ThrowsAsync<DetectProductChangesDisabledException>(() => job.RunAsync(CancellationToken.None));
                Assert.Empty(calls);
                Assert.Single(schedule.Removals);
                Assert.Empty(schedule.Registrations);
            }
        }

        [Fact]
        public void DetectionAutomaticRetryIsDisabled() {
            var method = typeof(DetectProductChangesJob).GetMethod("RunAsync", new[] { typeof(CancellationToken) })!;
            var retry = Assert.Single(method.GetCustomAttributes<AutomaticRetryAttribute>());
            Assert.Equal(0, retry.Attempts);
            Assert.Equal(AttemptsExceededAction.Fail, retry.OnAttemptsExceeded);
            Assert.Empty(typeof(DetectProductChangesJob).GetCustomAttributes<AutomaticRetryAttribute>());
        }

        [Theory]
        [InlineData(false)]
        [InlineData(true)]
        public void ProductionReconciliationUsesConfiguredManagerWithoutDashboard(bool enabled) {
            var manager = DispatchProxy.Create<IRecurringJobManager, RecurringJobManagerSpy>();
            var spy = (RecurringJobManagerSpy)(object)manager;
            // No Hangfire server, storage, or Dashboard initialization is needed for this boundary.
            using var services = new ServiceCollection().AddSingleton(manager).BuildServiceProvider();
            var logger = new RecordingLogger();

            DetectProductChangesRecurringJob.Reconcile(State(enabled.ToString()), services, logger);

            var call = Assert.Single(spy.Calls);
            Assert.Equal(enabled ? "AddOrUpdate" : "RemoveIfExists", call.Method);
            Assert.Equal("detect-product-changes-job", call.Arguments[0]);
            if (enabled) {
                Assert.Equal(4, call.Arguments.Length);
                var invocation = Assert.IsType<Job>(call.Arguments[1]);
                Assert.Equal(typeof(DetectProductChangesJob), invocation.Type);
                Assert.Equal(typeof(DetectProductChangesJob).GetMethod("RunAsync", new[] { typeof(CancellationToken) }), invocation.Method);
                Assert.Equal(CancellationToken.None, Assert.IsType<CancellationToken>(Assert.Single(invocation.Args)));
                Assert.Equal("0 23 * * *", call.Arguments[2]);
                var options = Assert.IsType<RecurringJobOptions>(call.Arguments[3]);
                Assert.Equal(TimeZoneInfo.Utc, options.TimeZone);
            }
            else {
                Assert.Single(call.Arguments);
            }
            Assert.Equal(LogLevel.Information, Assert.Single(logger.Entries).Level);
        }

        [Theory]
        [InlineData(false, false)]
        [InlineData(true, false)]
        [InlineData(false, true)]
        [InlineData(true, true)]
        public void ProductionManagerResolutionAndUseFailuresRemainInsideSafeBoundary(bool enabled, bool failResolution) {
            var technicalException = new InvalidOperationException("sensitive-storage-detail");
            var manager = DispatchProxy.Create<IRecurringJobManager, RecurringJobManagerSpy>();
            var spy = (RecurringJobManagerSpy)(object)manager;
            spy.Failure = technicalException;
            var resolutions = 0;
            var registrations = new ServiceCollection();
            registrations.AddSingleton<IRecurringJobManager>(_ => {
                resolutions++;
                if (failResolution)
                    throw technicalException;
                return manager;
            });
            using var services = registrations.BuildServiceProvider();
            var logger = new RecordingLogger();

            var exception = Assert.Throws<InvalidOperationException>(() =>
                DetectProductChangesRecurringJob.Reconcile(State(enabled.ToString()), services, logger)
            );

            Assert.Equal(1, resolutions);
            Assert.Equal(failResolution ? 0 : 1, spy.Calls.Count);
            Assert.Equal(
                "DETECT_PRODUCT_CHANGES_RECONCILIATION_FAILED: Product change detection recurring-job reconciliation failed.",
                exception.Message
            );
            Assert.Null(exception.InnerException);
            var diagnostic = Assert.Single(logger.Entries);
            Assert.Equal(LogLevel.Error, diagnostic.Level);
            Assert.Same(technicalException, diagnostic.Exception);
        }

        public class RecurringJobManagerSpy : DispatchProxy
        {
            public List<(string Method, object?[] Arguments)> Calls { get; } = new();
            public Exception? Failure { get; set; }

            protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) {
                Calls.Add((targetMethod!.Name, args!));
                if (Failure != null)
                    throw Failure;
                return null;
            }
        }

        private static DetectProductChangesState State(string value) {
            var configuration = new ConfigurationManager();
            configuration["EnableDetectProductChanges"] = value;
            return DetectProductChangesState.FromConfiguration(configuration);
        }

        private static void Reconcile(
            DetectProductChangesState state,
            RecordingSchedule schedule,
            RecordingLogger? logger = null
        ) => DetectProductChangesRecurringJob.Reconcile(
            state, logger ?? new RecordingLogger(), schedule.AddOrUpdate, schedule.RemoveIfExists
        );

        private static DetectProductChangesJob CreateJob(DetectProductChangesState state, List<string> calls) => new(
            DependencySpy<IProductRepository>.Create(calls),
            DependencySpy<IProductManager>.Create(calls),
            DependencySpy<IExportService>.Create(calls),
            DependencySpy<ISevenCsService>.Create(calls),
            DependencySpy<ILogger<DetectProductChangesJob>>.Create(calls),
            state
        );

        public sealed class DependencyAccessException : Exception { }

        public class DependencySpy<T> : DispatchProxy where T : class
        {
            private List<string> _calls = null!;

            public static T Create(List<string> calls) {
                var instance = DispatchProxy.Create<T, DependencySpy<T>>();
                ((DependencySpy<T>)(object)instance)._calls = calls;
                return instance;
            }

            protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) {
                _calls.Add($"{typeof(T).Name}.{targetMethod!.Name}");
                throw new DependencyAccessException();
            }
        }

        private sealed class RecordingSchedule
        {
            public HashSet<string> Definitions { get; } = new();
            public List<string> Removals { get; } = new();
            public List<(string Id, Expression<Func<DetectProductChangesJob, Task>> Invocation, string Cron)> Registrations { get; } = new();
            public Exception? Failure { get; init; }

            public void AddOrUpdate(string id, Expression<Func<DetectProductChangesJob, Task>> invocation, string cron) {
                if (Failure != null)
                    throw Failure;
                Registrations.Add((id, invocation, cron));
                Definitions.Add(id);
            }

            public void RemoveIfExists(string id) {
                if (Failure != null)
                    throw Failure;
                Removals.Add(id);
                Definitions.Remove(id);
            }
        }

        private sealed class RecordingLogger : ILogger
        {
            public List<(LogLevel Level, Exception? Exception)> Entries { get; } = new();
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                Entries.Add((logLevel, exception));
        }
    }
}
