using Hangfire;
using Microsoft.Extensions.Logging.Abstractions;
using ProductManagerAPI.Jobs;
using ProductManagerAPI.Services.Locking;
using ProductManagerAPI.Services.Operations;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using S100FC.YAML;
using YamlDataset = S100FC.YAML.Dataset;
using System.Collections;
using System.Reflection;
using static ProductManagerAPI.Models.RequestTypes;

namespace TestProductManagerAPI
{
    public class ExportOperationJobTests
    {
        [Fact]
        public void AutomaticRetryIsExplicitlyDisabled() {
            var method = typeof(ExportOperationJob).GetMethod(nameof(ExportOperationJob.RunAsync))!;
            var retry = Assert.Single(method.GetCustomAttributes<AutomaticRetryAttribute>());
            Assert.Equal(0, retry.Attempts);
        }

        [Fact]
        public void RequestContractDoesNotContainCancellationToken() {
            Assert.DoesNotContain(
                typeof(ExportOperationJobRequest).GetProperties(),
                property => property.PropertyType == typeof(CancellationToken)
            );
        }

        [Fact]
        public async Task LockConflictFailsAndPerformsNoReadsOrMutations() {
            var products = new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2));
            var operations = new RecordingOperationService();
            var context = new FakeExecutionContext();
            var job = CreateJob(products, new FakeLockService(false), operations);

            await Assert.ThrowsAsync<ExportOperationJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(ExportJobContract.DatasetBusyCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Equal(0, products.VersionReads);
            Assert.Equal(0, operations.TotalCalls);
        }

        [Fact]
        public async Task ExistingExecutionGuardStopsBeforeVersionRead() {
            var products = new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2));
            var operations = new RecordingOperationService();
            var context = new FakeExecutionContext();
            context.SetJobParameter(ExportJobParameterNames.ExecutionStarted, true);
            var job = CreateJob(products, new FakeLockService(true), operations);

            await Assert.ThrowsAsync<ExportOperationJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(ExportJobContract.ManualReviewRequiredCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Equal(0, products.VersionReads);
            Assert.Equal(0, operations.TotalCalls);
        }

        [Fact]
        public async Task MissingGuardIsFollowedByAuthoritativeVersionValidation() {
            var products = new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 5, 2));
            var operations = new RecordingOperationService();
            var context = new FakeExecutionContext();
            var job = CreateJob(products, new FakeLockService(true), operations);

            await Assert.ThrowsAsync<ExportOperationJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(1, products.VersionReads);
            Assert.Equal(ExportJobContract.ProductVersionChangedCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.False(context.Contains(ExportJobParameterNames.ExecutionStarted));
            Assert.Equal(0, operations.TotalCalls);
        }

        [Fact]
        public async Task AmbiguousExecutionFailsWithoutSettingGuard() {
            var products = new FakeElectronicProductManager(
                new ProductDataIntegrityException("101DK001", 2)
            );
            var context = new FakeExecutionContext();
            var operations = new RecordingOperationService();
            var job = CreateJob(products, new FakeLockService(true), operations);

            await Assert.ThrowsAsync<ExportOperationJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(ExportJobContract.ProductDataIntegrityErrorCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Equal(ExportJobContract.ProductDataIntegrityJobMessage, context.Get<string>(ExportJobParameterNames.ErrorMessage));
            Assert.Equal(1, products.VersionReads);
            Assert.False(context.Contains(ExportJobParameterNames.ExecutionStarted));
            Assert.Equal(0, operations.TotalCalls);
        }

        [Fact]
        public async Task GuardIsSetBeforeOperationBegins() {
            var context = new FakeExecutionContext();
            var operations = new RecordingOperationService {
                BeforeCall = () => Assert.True(
                    context.Get<bool?>(ExportJobParameterNames.ExecutionStarted) == true
                )
            };
            var job = CreateJob(
                new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2)),
                new FakeLockService(true),
                operations
            );

            await job.ExecuteAsync(Request(), context, CancellationToken.None);

            Assert.Equal(1, operations.NewEditionCalls);
            Assert.Equal(ExportOperationContract.ExportCompletedCode, context.Get<string>(ExportJobParameterNames.ResultCode));
            Assert.Null(context.Get<string>(ExportJobParameterNames.ErrorCode));
        }

        [Fact]
        public async Task MissingProductFailsWithoutSettingGuardOrCallingOperation() {
            var context = new FakeExecutionContext();
            var operations = new RecordingOperationService();
            var job = CreateJob(
                new FakeElectronicProductManager((ElectronicProductVersion?)null),
                new FakeLockService(true),
                operations
            );

            await Assert.ThrowsAsync<ExportOperationJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(
                ExportJobContract.ProductNotFoundCode,
                context.Get<string>(ExportJobParameterNames.ErrorCode)
            );
            Assert.False(context.Contains(ExportJobParameterNames.ExecutionStarted));
            Assert.Equal(0, operations.TotalCalls);
        }

        [Fact]
        public async Task SameJobIsNotExecutedTwiceAfterGuardWasSet() {
            var context = new FakeExecutionContext();
            var products = new FakeElectronicProductManager(
                new ElectronicProductVersion("101DK001", 4, 2)
            );
            var operations = new RecordingOperationService();
            var job = CreateJob(products, new FakeLockService(true), operations);

            await job.ExecuteAsync(Request(), context, CancellationToken.None);
            await Assert.ThrowsAsync<ExportOperationJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(1, operations.TotalCalls);
            Assert.Equal(1, products.VersionReads);
            Assert.Equal(
                ExportJobContract.ManualReviewRequiredCode,
                context.Get<string>(ExportJobParameterNames.ErrorCode)
            );
        }

        [Fact]
        public async Task ExecutionTokenIsPassedToOperationService() {
            using var source = new CancellationTokenSource();
            var context = new FakeExecutionContext();
            var operations = new RecordingOperationService();
            var job = CreateJob(
                new FakeElectronicProductManager(
                    new ElectronicProductVersion("101DK001", 4, 2)
                ),
                new FakeLockService(true),
                operations
            );

            await job.ExecuteAsync(Request(), context, source.Token);

            Assert.Equal(source.Token, operations.LastCancellationToken);
        }


        [Fact]
        public async Task OperationPreconditionFailureDoesNotSetExecutionGuard() {
            var context = new FakeExecutionContext();
            var operations = new RecordingOperationService {
                RejectBeforeMutation = true
            };
            var job = CreateJob(
                new FakeElectronicProductManager(
                    new ElectronicProductVersion("101DK001", 4, 2)
                ),
                new FakeLockService(true),
                operations
            );

            var exception = await Assert.ThrowsAsync<ExportOperationJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.False(context.Contains(ExportJobParameterNames.ExecutionStarted));
            Assert.Equal(
                ExportJobContract.ProductOperationRejectedCode,
                context.Get<string>(ExportJobParameterNames.ErrorCode)
            );
            Assert.Equal(
                "Operation precondition failed.",
                context.Get<string>(ExportJobParameterNames.ErrorMessage)
            );
            Assert.Equal(
                ExportJobContract.ProductOperationRejectedCode,
                exception.Code
            );
        }

        [Fact]
        public async Task OperationFailureStoresOnlySafeErrorMetadata() {
            var context = new FakeExecutionContext();
            var operations = new RecordingOperationService {
                ExceptionToThrow = new InvalidOperationException(
                    @"Compiler failed at C:\secret\internal.yaml"
                )
            };
            var job = CreateJob(
                new FakeElectronicProductManager(
                    new ElectronicProductVersion("101DK001", 4, 2)
                ),
                new FakeLockService(true),
                operations
            );

            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(
                ExportJobContract.ExportFailedCode,
                context.Get<string>(ExportJobParameterNames.ErrorCode)
            );
            var safeMessage = context.Get<string>(ExportJobParameterNames.ErrorMessage);
            Assert.Equal(ExportJobContract.ExportFailedMessage, safeMessage);
            Assert.False(safeMessage!.Contains("secret", StringComparison.OrdinalIgnoreCase));
        }

        [Fact]
        public async Task RollbackWarningIsPersistedOnSucceededExecution() {
            var context = new FakeExecutionContext();
            var operations = new RecordingOperationService {
                RollbackResult = new ExportOperationResult(
                    ExportOperationContract.RollbackCompletedCode,
                    ExportOperationContract.RollbackCompletedMessage,
                    new ExportOperationWarning(
                        ExportOperationContract.RollbackCleanupFailedCode,
                        ExportOperationContract.RollbackCleanupFailedMessage
                    )
                )
            };
            var job = CreateJob(
                new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2)),
                new FakeLockService(true),
                operations
            );

            await job.ExecuteAsync(
                Request(ExportOperationType.Rollback, exportTarget: null),
                context,
                CancellationToken.None
            );

            Assert.Equal(
                ExportOperationContract.RollbackCleanupFailedCode,
                context.Get<string>(ExportJobParameterNames.WarningCode)
            );
            Assert.Null(context.Get<string>(ExportJobParameterNames.ErrorCode));
        }

        private static ExportOperationJob CreateJob(
            IElectronicProductManager products,
            IDatasetLockService locks,
            IExportOperationService operations
        ) => new(
            new FakeProductManager(products),
            locks,
            operations,
            NullLogger<ExportOperationJob>.Instance
        );

        private static ExportOperationJobRequest Request(
            ExportOperationType operationType = ExportOperationType.ExportEdition,
            string? exportTarget = "S100"
        ) => new(
            "101DK001",
            operationType,
            exportTarget,
            4,
            2,
            "correlation-1",
            DateTimeOffset.Parse("2026-07-22T08:00:00Z")
        );

        private sealed class FakeExecutionContext : IExportJobExecutionContext
        {
            private readonly Dictionary<string, object?> _parameters = [];
            public string JobId => "job-1";
            public T? GetJobParameter<T>(string name) => Get<T>(name);
            public void SetJobParameter(string name, object? value) => _parameters[name] = value;
            public bool Contains(string name) => _parameters.ContainsKey(name);
            public T? Get<T>(string name) => _parameters.TryGetValue(name, out var value) ? (T?)value : default;
        }

        private sealed class FakeLockService(bool acquired) : IDatasetLockService
        {
            public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) =>
                Task.FromResult<IAsyncDisposable?>(acquired ? new Handle() : null);

            private sealed class Handle : IAsyncDisposable
            {
                public ValueTask DisposeAsync() => ValueTask.CompletedTask;
            }
        }

        private sealed class RecordingOperationService : IExportOperationService
        {
            public int NewEditionCalls { get; private set; }
            public int RollbackCalls { get; private set; }
            public int TotalCalls => NewEditionCalls + RollbackCalls;
            public Action? BeforeCall { get; init; }
            public Exception? ExceptionToThrow { get; init; }
            public bool RejectBeforeMutation { get; init; }
            public CancellationToken LastCancellationToken { get; private set; }
            public ExportOperationResult RollbackResult { get; init; } = new(
                ExportOperationContract.RollbackCompletedCode,
                ExportOperationContract.RollbackCompletedMessage
            );

            public Task<ExportOperationResult> ExecuteNewEditionAsync(
                string datasetName,
                ExportFormat exportTarget,
                string? user,
                CancellationToken cancellationToken = default,
                Action? beforeMutation = null
            ) {
                if (RejectBeforeMutation)
                    throw new ExportOperationRejectedException("Operation precondition failed.");

                beforeMutation?.Invoke();
                BeforeCall?.Invoke();
                LastCancellationToken = cancellationToken;
                NewEditionCalls++;
                if (ExceptionToThrow != null)
                    throw ExceptionToThrow;
                return Task.FromResult(new ExportOperationResult(
                    ExportOperationContract.ExportCompletedCode,
                    ExportOperationContract.ExportCompletedMessage
                ));
            }

            public Task<ExportOperationResult> ExecuteRollbackAsync(
                string datasetName,
                CancellationToken cancellationToken = default,
                Action? beforeMutation = null
            ) {
                if (RejectBeforeMutation)
                    throw new ExportOperationRejectedException("Operation precondition failed.");

                beforeMutation?.Invoke();
                BeforeCall?.Invoke();
                LastCancellationToken = cancellationToken;
                RollbackCalls++;
                if (ExceptionToThrow != null)
                    throw ExceptionToThrow;
                return Task.FromResult(RollbackResult);
            }
        }

        private sealed class FakeProductManager(IElectronicProductManager electronicProductManager) : IProductManager
        {
            public INauticalProductManager NauticalProductManager => null!;
            public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
        }

        private sealed class FakeElectronicProductManager : IElectronicProductManager
        {
            private readonly ElectronicProductVersion? _version;
            private readonly ProductDataIntegrityException? _integrityException;

            public FakeElectronicProductManager(ElectronicProductVersion? version) {
                _version = version;
            }

            public FakeElectronicProductManager(ProductDataIntegrityException integrityException) {
                _integrityException = integrityException;
            }

            public int VersionReads { get; private set; }
            public string OutputFolder => string.Empty;

            public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) {
                VersionReads++;
                if (_integrityException != null)
                    throw _integrityException;
                return Task.FromResult(_version);
            }

            public ElectronicProduct? ElectronicProduct(string name) => null;
            public IEnumerator<string> GetEnumerator() => Array.Empty<string>().AsEnumerable().GetEnumerator();
            IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
            public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null) => throw new NotSupportedException();
            public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, string boundary, int edition, int update, byte[] zipfile) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewEditionAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> ReissueAsync(string name) => throw new NotSupportedException();
            public Task<bool> RollBackAsync(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, string>> GetDatasetAOIs() => throw new NotSupportedException();
            public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
            public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => throw new NotSupportedException();
            public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
            public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) => throw new NotSupportedException();
            public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
        }
    }
}
