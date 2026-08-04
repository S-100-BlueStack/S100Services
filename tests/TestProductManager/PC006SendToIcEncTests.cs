using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ProductManagerAPI.Options;
using ProductManagerAPI.Controllers;
using ProductManagerAPI.Data.Models;
using ProductManagerAPI.Data.Repositories;
using ProductManagerAPI.Jobs;
using ProductManagerAPI.Models;
using ProductManagerAPI.Services.Jobs;
using ProductManagerAPI.Services.Locking;
using System.Reflection;
using System.Text.Json;

namespace TestProductManagerAPI
{
    public sealed class PC006SendToIcEncTests
    {
        private const string DatasetName = "101DK001";

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task DisabledEndpointReturnsSafeServiceUnavailableWithoutEnqueueOrMutation() {
            var repository = new RecordingProductRepository(Product());
            var jobs = new RecordingSendJobService();
            var locks = new ThrowingLockService();
            var controller = Controller(repository, locks, jobs, SendToIcEncMode.Disabled);

            var result = await controller.UploadSingularProduct(DatasetName, CancellationToken.None);

            var response = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status503ServiceUnavailable, response.StatusCode);
            Assert.Contains("application/json", response.ContentTypes);
            var error = Assert.IsType<ExportJobErrorResponse>(response.Value);
            Assert.Equal(SendToIcEncContract.DisabledCode, error.Code);
            Assert.Equal(SendToIcEncContract.DisabledMessage, error.Message);
            Assert.False(error.Message.Contains("exception", StringComparison.OrdinalIgnoreCase));
            Assert.Equal(0, jobs.EnqueueCalls);
            Assert.Equal(0, repository.ReadCalls);
            Assert.Equal(0, repository.AppendCalls);
            Assert.Equal(0, locks.AcquireCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task SimulationEndpointAcceptsTruthfulBackgroundJobWithoutProductMutation() {
            var repository = new RecordingProductRepository(Product());
            var jobs = new RecordingSendJobService();
            var locks = new ThrowingLockService();
            var controller = Controller(repository, locks, jobs, SendToIcEncMode.Simulation);

            var result = await controller.UploadSingularProduct(DatasetName, CancellationToken.None);

            var accepted = Assert.IsType<AcceptedResult>(result);
            Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);
            var response = Assert.IsType<ExportJobStartResponse>(accepted.Value);
            Assert.Equal("job-1", response.JobId);
            Assert.Equal(SendToIcEncContract.OperationType, response.OperationType);
            Assert.Equal(SendToIcEncContract.SimulationMode, response.Mode);
            Assert.Equal(SendToIcEncContract.NotDeliveredStatus, response.DeliveryStatus);
            Assert.Equal(SendToIcEncContract.AcceptedMessage, response.Message);
            Assert.Equal(1, jobs.EnqueueCalls);
            Assert.Equal(SendToIcEncMode.Simulation, jobs.LastRequest!.Mode);
            Assert.Equal(5, jobs.LastRequest.ExpectedEdition);
            Assert.Equal(0, jobs.LastRequest.ExpectedUpdate);
            Assert.Equal(0, repository.AppendCalls);
            Assert.Equal(0, locks.AcquireCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task MissingProductReturnsNotFoundWithoutEnqueueOrMutation() {
            var repository = new RecordingProductRepository(null);
            var jobs = new RecordingSendJobService();
            var controller = Controller(repository, new ThrowingLockService(), jobs, SendToIcEncMode.Simulation);

            var result = await controller.UploadSingularProduct(DatasetName, CancellationToken.None);

            var response = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status404NotFound, response.StatusCode);
            Assert.Equal(ExportJobContract.ProductNotFoundCode, Assert.IsType<ExportJobErrorResponse>(response.Value).Code);
            Assert.Equal(0, jobs.EnqueueCalls);
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task ProductLookupFailureReturnsSafeServiceUnavailableWithoutEnqueueOrMutation() {
            var repository = new RecordingProductRepository(Product()) {
                ExceptionToThrow = new InvalidOperationException(@"secret C:\internal\database")
            };
            var jobs = new RecordingSendJobService();
            var controller = Controller(
                repository,
                new ThrowingLockService(),
                jobs,
                SendToIcEncMode.Simulation
            );

            var result = await controller.UploadSingularProduct(
                DatasetName,
                CancellationToken.None
            );

            var response = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status503ServiceUnavailable, response.StatusCode);
            var error = Assert.IsType<ExportJobErrorResponse>(response.Value);
            Assert.Equal(SendToIcEncContract.SetupFailedCode, error.Code);
            Assert.Equal(SendToIcEncContract.SetupFailedMessage, error.Message);
            Assert.DoesNotContain("secret", error.Message, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(0, jobs.EnqueueCalls);
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task InvalidProductStateReturnsConflictWithoutEnqueueOrMutation() {
            var repository = new RecordingProductRepository(Product(ProductState.Idle));
            var jobs = new RecordingSendJobService();
            var controller = Controller(repository, new ThrowingLockService(), jobs, SendToIcEncMode.Simulation);

            var result = await controller.UploadSingularProduct(DatasetName, CancellationToken.None);

            var response = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status409Conflict, response.StatusCode);
            Assert.Equal(SendToIcEncContract.InvalidStateCode, Assert.IsType<ExportJobErrorResponse>(response.Value).Code);
            Assert.Equal(0, jobs.EnqueueCalls);
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task EnqueueFailureReturnsSafeServiceUnavailableWithoutMutation() {
            var repository = new RecordingProductRepository(Product());
            var jobs = new RecordingSendJobService { ExceptionToThrow = new JobEnqueueException(@"secret C:\internal") };
            var controller = Controller(repository, new ThrowingLockService(), jobs, SendToIcEncMode.Simulation);

            var result = await controller.UploadSingularProduct(DatasetName, CancellationToken.None);

            var response = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status503ServiceUnavailable, response.StatusCode);
            var error = Assert.IsType<ExportJobErrorResponse>(response.Value);
            Assert.Equal(ExportJobContract.JobEnqueueFailedCode, error.Code);
            Assert.Equal(ExportJobContract.JobEnqueueFailedMessage, error.Message);
            Assert.False(error.Message.Contains("secret", StringComparison.OrdinalIgnoreCase));
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void HangfireServiceEnqueuesSimulationJobWithTruthfulAcceptedContract() {
            var client = new RecordingBackgroundJobClient();
            var service = new HangfireSendToIcEncJobService(
                client,
                NullLogger<HangfireSendToIcEncJobService>.Instance
            );

            var response = service.Enqueue(Request());

            Assert.Equal(1, client.CreateCalls);
            Assert.Equal(typeof(UploadSingularProductJob), client.LastJob!.Type);
            Assert.IsType<EnqueuedState>(client.LastState);
            Assert.Equal(SendToIcEncContract.OperationType, response.OperationType);
            Assert.Equal(SendToIcEncContract.NotDeliveredStatus, response.DeliveryStatus);
            Assert.Contains("No data will be delivered", response.Message!);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task SimulationJobCompletesAsNotDeliveredWithoutRepositoryAppend() {
            var repository = new RecordingProductRepository(Product());
            var context = new RecordingExecutionContext();
            var job = Job(repository, SendToIcEncMode.Simulation);

            await job.ExecuteAsync(Request(), context, CancellationToken.None);

            Assert.Equal(SendToIcEncContract.SimulationMode, context.Get<string>(ExportJobParameterNames.Mode));
            Assert.Equal(SendToIcEncContract.SimulationCompletedOutcome, context.Get<string>(ExportJobParameterNames.OperationOutcome));
            Assert.Equal(SendToIcEncContract.NotDeliveredStatus, context.Get<string>(ExportJobParameterNames.DeliveryStatus));
            Assert.Equal(SendToIcEncContract.CompletedCode, context.Get<string>(ExportJobParameterNames.ResultCode));
            Assert.Equal(SendToIcEncContract.CompletedMessage, context.Get<string>(ExportJobParameterNames.ResultMessage));
            Assert.Null(context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task MissingProductFailsSimulationWithoutCompletionOrMutation() {
            var repository = new RecordingProductRepository(null);
            var context = new RecordingExecutionContext();
            var job = Job(repository, SendToIcEncMode.Simulation);

            var exception = await Assert.ThrowsAsync<SendToIcEncJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(ExportJobContract.ProductNotFoundCode, exception.Code);
            Assert.Equal(ExportJobContract.ProductNotFoundCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Null(context.Get<string>(ExportJobParameterNames.OperationOutcome));
            Assert.Null(context.Get<string>(ExportJobParameterNames.ResultCode));
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task ConfigurationChangeFailsSimulationWithoutCompletionOrMutation() {
            var repository = new RecordingProductRepository(Product());
            var context = new RecordingExecutionContext();
            context.SetJobParameter(
                ExportJobParameterNames.OperationOutcome,
                SendToIcEncContract.SimulationCompletedOutcome
            );
            context.SetJobParameter(
                ExportJobParameterNames.ResultCode,
                SendToIcEncContract.CompletedCode
            );
            context.SetJobParameter(
                ExportJobParameterNames.ResultMessage,
                SendToIcEncContract.CompletedMessage
            );
            var job = Job(repository, SendToIcEncMode.Disabled);

            var exception = await Assert.ThrowsAsync<SendToIcEncJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(SendToIcEncContract.ConfigurationChangedCode, exception.Code);
            Assert.Equal(SendToIcEncContract.ConfigurationChangedCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Null(context.Get<string>(ExportJobParameterNames.OperationOutcome));
            Assert.Null(context.Get<string>(ExportJobParameterNames.ResultCode));
            Assert.Null(context.Get<string>(ExportJobParameterNames.ResultMessage));
            Assert.Equal(0, repository.ReadCalls);
            Assert.Equal(0, repository.AppendCalls);
        }

        [Theory]
        [InlineData(ProductState.Idle, 5, 0, SendToIcEncContract.InvalidStateCode)]
        [InlineData(ProductState.Exported, 6, 0, ExportJobContract.ProductVersionChangedCode)]
        [Trait("Package", "PC-006")]
        public async Task ProductChangeFailsWithoutFabricatedState(
            ProductState state,
            int edition,
            int update,
            string expectedCode
        ) {
            var repository = new RecordingProductRepository(Product(state, edition, update));
            var context = new RecordingExecutionContext();
            var job = Job(repository, SendToIcEncMode.Simulation);

            await Assert.ThrowsAsync<SendToIcEncJobException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(expectedCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Null(context.Get<string>(ExportJobParameterNames.OperationOutcome));
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task UnexpectedJobFailurePersistsOnlySafeFailureMetadata() {
            var repository = new RecordingProductRepository(Product()) {
                ExceptionToThrow = new InvalidOperationException(@"secret C:\internal\database")
            };
            var context = new RecordingExecutionContext();
            var job = Job(repository, SendToIcEncMode.Simulation);

            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                job.ExecuteAsync(Request(), context, CancellationToken.None)
            );

            Assert.Equal(SendToIcEncContract.FailedCode, context.Get<string>(ExportJobParameterNames.ErrorCode));
            Assert.Equal(SendToIcEncContract.FailedMessage, context.Get<string>(ExportJobParameterNames.ErrorMessage));
            Assert.DoesNotContain("secret", context.Get<string>(ExportJobParameterNames.ErrorMessage)!, StringComparison.OrdinalIgnoreCase);
            Assert.Null(context.Get<string>(ExportJobParameterNames.OperationOutcome));
            Assert.Equal(0, repository.AppendCalls);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void SimulationMetadataAndStatusPollingRemainTruthful() {
            var parameters = ExportJobMetadataClientFilter.CreateParameters(Request());
            Assert.Equal(SendToIcEncContract.SimulationMode, parameters[ExportJobParameterNames.Mode]);
            Assert.Equal(SendToIcEncContract.NotDeliveredStatus, parameters[ExportJobParameterNames.DeliveryStatus]);

            var persisted = parameters.ToDictionary(
                item => item.Key,
                item => item.Value == null ? null : JsonSerializer.Serialize(item.Value),
                StringComparer.Ordinal
            );
            var activeService = new HangfireJobStatusService(
                new StaticStorageAccessor(new HangfireJobSnapshot(
                    persisted,
                    [new HangfireStateSnapshot("Enqueued", DateTime.UtcNow)]
                )),
                NullLogger<HangfireJobStatusService>.Instance
            );
            var activeResponse = Assert.Single(activeService.GetActiveJobs(DatasetName));
            Assert.Equal(ExportJobContract.QueuedStatus, activeResponse.Status);
            Assert.Equal(SendToIcEncContract.SimulationMode, activeResponse.Mode);
            Assert.Equal(SendToIcEncContract.NotDeliveredStatus, activeResponse.DeliveryStatus);

            persisted[ExportJobParameterNames.OperationOutcome] = JsonSerializer.Serialize(
                SendToIcEncContract.SimulationCompletedOutcome
            );
            persisted[ExportJobParameterNames.ResultCode] = JsonSerializer.Serialize(
                SendToIcEncContract.CompletedCode
            );
            persisted[ExportJobParameterNames.ResultMessage] = JsonSerializer.Serialize(
                SendToIcEncContract.CompletedMessage
            );
            var snapshot = new HangfireJobSnapshot(
                persisted,
                [new HangfireStateSnapshot("Succeeded", DateTime.SpecifyKind(new DateTime(2026, 8, 3, 8, 0, 0), DateTimeKind.Utc))]
            );
            var service = new HangfireJobStatusService(
                new StaticStorageAccessor(snapshot),
                NullLogger<HangfireJobStatusService>.Instance
            );

            var response = service.GetJob("job-1");

            Assert.NotNull(response);
            Assert.Equal(SendToIcEncContract.OperationType, response!.OperationType);
            Assert.Equal(SendToIcEncContract.SimulationMode, response.Mode);
            Assert.Equal(SendToIcEncContract.SimulationCompletedOutcome, response.OperationOutcome);
            Assert.Equal(SendToIcEncContract.NotDeliveredStatus, response.DeliveryStatus);
            Assert.Equal(SendToIcEncContract.CompletedMessage, response.Message);
            Assert.Null(response.Error);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void FailedSimulationStatusPublishesOnlySafeBackendMetadata() {
            var parameters = ExportJobMetadataClientFilter.CreateParameters(Request()).ToDictionary(
                item => item.Key,
                item => item.Value == null ? null : JsonSerializer.Serialize(item.Value),
                StringComparer.Ordinal
            );
            parameters[ExportJobParameterNames.OperationOutcome] = JsonSerializer.Serialize(
                SendToIcEncContract.SimulationCompletedOutcome
            );
            parameters[ExportJobParameterNames.ErrorCode] = JsonSerializer.Serialize(SendToIcEncContract.FailedCode);
            parameters[ExportJobParameterNames.ErrorMessage] = JsonSerializer.Serialize(SendToIcEncContract.FailedMessage);
            var service = new HangfireJobStatusService(
                new StaticStorageAccessor(new HangfireJobSnapshot(
                    parameters,
                    [new HangfireStateSnapshot("Failed", DateTime.UtcNow)]
                )),
                NullLogger<HangfireJobStatusService>.Instance
            );

            var response = service.GetJob("job-1");

            Assert.NotNull(response);
            Assert.Equal(ExportJobContract.FailedStatus, response!.Status);
            Assert.Equal(SendToIcEncContract.FailedCode, response.Error!.Code);
            Assert.Equal(SendToIcEncContract.FailedMessage, response.Error.Message);
            Assert.DoesNotContain("secret", response.Error.Message, StringComparison.OrdinalIgnoreCase);
            Assert.Null(response.OperationOutcome);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void InvalidTerminalSimulationMetadataIsNotPublishedAsSuccess() {
            var parameters = ExportJobMetadataClientFilter.CreateParameters(Request()).ToDictionary(
                item => item.Key,
                item => item.Value == null ? null : JsonSerializer.Serialize(item.Value),
                StringComparer.Ordinal
            );
            parameters[ExportJobParameterNames.OperationOutcome] = JsonSerializer.Serialize("Delivered");
            parameters[ExportJobParameterNames.ResultCode] = JsonSerializer.Serialize("DELIVERED");
            parameters[ExportJobParameterNames.ResultMessage] = JsonSerializer.Serialize("Sent successfully");
            var service = new HangfireJobStatusService(
                new StaticStorageAccessor(new HangfireJobSnapshot(
                    parameters,
                    [new HangfireStateSnapshot("Succeeded", DateTime.UtcNow)]
                )),
                NullLogger<HangfireJobStatusService>.Instance
            );

            Assert.Null(service.GetJob("job-1"));
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task FreezeFlowStillUsesDatasetLockAndAppendsAuthoritativeVersion() {
            var repository = new RecordingProductRepository(Product(ProductState.Idle));
            var locks = new AcquiredLockService();
            var controller = Controller(
                repository,
                locks,
                new RecordingSendJobService(),
                SendToIcEncMode.Disabled
            );

            var result = await controller.FreezeProduct(DatasetName, CancellationToken.None);

            Assert.IsType<OkResult>(result);
            Assert.Equal(1, locks.AcquireCalls);
            Assert.Equal(1, repository.AppendCalls);
            Assert.Equal(ProductState.Frozen, repository.LastAppendState);
            Assert.Equal((uint)5, repository.LastAppendEdition);
            Assert.Equal((uint?)0, repository.LastAppendUpdate);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public async Task UnfreezeFlowStillUsesDatasetLockAndAppendsAuthoritativeVersion() {
            var repository = new RecordingProductRepository(Product(ProductState.Frozen));
            var locks = new AcquiredLockService();
            var controller = Controller(
                repository,
                locks,
                new RecordingSendJobService(),
                SendToIcEncMode.Disabled
            );

            var result = await controller.UnfreezeProduct(DatasetName, CancellationToken.None);

            Assert.IsType<OkResult>(result);
            Assert.Equal(1, locks.AcquireCalls);
            Assert.Equal(1, repository.AppendCalls);
            Assert.Equal(ProductState.Idle, repository.LastAppendState);
            Assert.Equal((uint)5, repository.LastAppendEdition);
            Assert.Equal((uint?)0, repository.LastAppendUpdate);
        }

        [Theory]
        [InlineData("ExportEdition", "S100")]
        [InlineData("Rollback", null)]
        [Trait("Package", "PC-006")]
        public void ExistingExportAndRollbackStatusAndActiveLookupRemainUnchanged(
            string operationType,
            string? exportTarget
        ) {
            var parameters = new Dictionary<string, string?>(StringComparer.Ordinal) {
                [ExportJobParameterNames.DatasetName] = JsonSerializer.Serialize(DatasetName),
                [ExportJobParameterNames.OperationType] = JsonSerializer.Serialize(operationType),
                [ExportJobParameterNames.ExportTarget] = exportTarget == null
                    ? null
                    : JsonSerializer.Serialize(exportTarget),
                [ExportJobParameterNames.ExpectedEdition] = JsonSerializer.Serialize(5),
                [ExportJobParameterNames.ExpectedUpdate] = JsonSerializer.Serialize(0),
                [ExportJobParameterNames.CorrelationId] = JsonSerializer.Serialize("correlation-export"),
                [ExportJobParameterNames.CreatedAtUtc] = JsonSerializer.Serialize("2026-08-03T08:00:00.0000000+00:00")
            };
            var service = new HangfireJobStatusService(
                new StaticStorageAccessor(new HangfireJobSnapshot(
                    parameters,
                    [new HangfireStateSnapshot("Enqueued", DateTime.UtcNow)]
                )),
                NullLogger<HangfireJobStatusService>.Instance
            );

            var response = Assert.Single(service.GetActiveJobs(DatasetName));

            Assert.Equal(operationType, response.OperationType);
            Assert.Equal(exportTarget, response.ExportTarget);
            Assert.Equal(ExportJobContract.QueuedStatus, response.Status);
            Assert.Null(response.Mode);
            Assert.Null(response.OperationOutcome);
            Assert.Null(response.DeliveryStatus);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void ConfigurationValidatorRejectsLiveAndUnknownModes() {
            var validator = new SendToIcEncOptionsValidator();

            Assert.False(validator.Validate(null, new SendToIcEncOptions { Mode = SendToIcEncMode.Live }).Succeeded);
            Assert.False(validator.Validate(null, new SendToIcEncOptions { Mode = (SendToIcEncMode)999 }).Succeeded);
            Assert.True(validator.Validate(null, new SendToIcEncOptions { Mode = SendToIcEncMode.Disabled }).Succeeded);
            Assert.True(validator.Validate(null, new SendToIcEncOptions { Mode = SendToIcEncMode.Simulation }).Succeeded);
        }

        [Fact]
        [Trait("Package", "PC-006")]
        public void SimulationJobDisablesAutomaticRetryAndRequestContainsNoCancellationToken() {
            var method = typeof(UploadSingularProductJob).GetMethod(nameof(UploadSingularProductJob.RunAsync))!;
            var retry = Assert.Single(method.GetCustomAttributes<AutomaticRetryAttribute>());

            Assert.Equal(0, retry.Attempts);
            Assert.DoesNotContain(
                typeof(SendToIcEncJobRequest).GetProperties(),
                property => property.PropertyType == typeof(CancellationToken)
            );
        }

        private static UploadController Controller(
            RecordingProductRepository repository,
            IDatasetLockService locks,
            ISendToIcEncJobService jobs,
            SendToIcEncMode mode
        ) {
            var controller = new UploadController(
                NullLogger<UploadController>.Instance,
                repository,
                locks,
                jobs,
                new StaticOptionsMonitor<SendToIcEncOptions>(new SendToIcEncOptions { Mode = mode }),
                TimeProvider.System
            ) {
                ControllerContext = new ControllerContext {
                    HttpContext = new DefaultHttpContext {
                        TraceIdentifier = "correlation-1"
                    }
                }
            };
            return controller;
        }

        private static UploadSingularProductJob Job(
            RecordingProductRepository repository,
            SendToIcEncMode mode
        ) => new(
            repository,
            new StaticOptionsMonitor<SendToIcEncOptions>(new SendToIcEncOptions { Mode = mode }),
            NullLogger<UploadSingularProductJob>.Instance
        );

        private static SendToIcEncJobRequest Request() => new(
            DatasetName,
            SendToIcEncMode.Simulation,
            5,
            0,
            "correlation-1",
            DateTimeOffset.Parse("2026-08-03T08:00:00Z")
        );

        private static ProductRecord Product(
            ProductState state = ProductState.Exported,
            int edition = 5,
            int update = 0
        ) => new() {
            Id = Guid.NewGuid(),
            Name = DatasetName,
            State = state,
            ProductSpecification = "S-101",
            EditionNo = edition,
            UpdateNo = update
        };

        private sealed class RecordingSendJobService : ISendToIcEncJobService
        {
            public int EnqueueCalls { get; private set; }
            public SendToIcEncJobRequest? LastRequest { get; private set; }
            public Exception? ExceptionToThrow { get; init; }

            public ExportJobStartResponse Enqueue(SendToIcEncJobRequest request) {
                EnqueueCalls++;
                LastRequest = request;
                if (ExceptionToThrow != null)
                    throw ExceptionToThrow;

                return new ExportJobStartResponse {
                    JobId = "job-1",
                    DatasetName = request.DatasetName,
                    OperationType = SendToIcEncContract.OperationType,
                    Status = ExportJobContract.QueuedStatus,
                    CreatedAt = request.CreatedAtUtc,
                    CorrelationId = request.CorrelationId,
                    StatusUrl = "/jobs/job-1",
                    Mode = SendToIcEncContract.SimulationMode,
                    DeliveryStatus = SendToIcEncContract.NotDeliveredStatus,
                    Message = SendToIcEncContract.AcceptedMessage
                };
            }
        }

        private sealed class RecordingProductRepository(ProductRecord? current) : IProductRepository
        {
            public int ReadCalls { get; private set; }
            public int AppendCalls { get; private set; }
            public Exception? ExceptionToThrow { get; init; }
            public ProductState? LastAppendState { get; private set; }
            public uint? LastAppendEdition { get; private set; }
            public uint? LastAppendUpdate { get; private set; }

            public Task<ProductRecord?> GetCurrentByNameAsync(string name) {
                ReadCalls++;
                if (ExceptionToThrow != null)
                    throw ExceptionToThrow;

                return Task.FromResult(current);
            }

            public Task AppendAsync(string name, ProductState state, string productSpecification, uint editionNo, uint? updateNo, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null) {
                AppendCalls++;
                LastAppendState = state;
                LastAppendEdition = editionNo;
                LastAppendUpdate = updateNo;
                return Task.CompletedTask;
            }

            public Task<IEnumerable<ProductRecord>> GetCurrentAsync() => Task.FromResult<IEnumerable<ProductRecord>>([]);
            public Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names) => Task.FromResult<IEnumerable<ProductRecord>>([]);
            public Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName) => Task.FromResult<DateTime?>(null);
            public Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime) => Task.CompletedTask;
            public Task<string[]> GetIneligbleProductsAsync() => Task.FromResult(Array.Empty<string>());
            public Task<string[]> GetEligibleProductsAsync() => Task.FromResult(Array.Empty<string>());
            public Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name) => Task.FromResult<IEnumerable<ProductRecord>>([]);
            public Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive) => Task.FromResult<IEnumerable<ProductRecord>>([]);
        }

        private sealed class AcquiredLockService : IDatasetLockService
        {
            public int AcquireCalls { get; private set; }

            public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) {
                AcquireCalls++;
                return Task.FromResult<IAsyncDisposable?>(new NoopAsyncDisposable());
            }
        }

        private sealed class NoopAsyncDisposable : IAsyncDisposable
        {
            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }

        private sealed class ThrowingLockService : IDatasetLockService
        {
            public int AcquireCalls { get; private set; }

            public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) {
                AcquireCalls++;
                throw new InvalidOperationException("Simulation must not acquire the dataset lock.");
            }
        }

        private sealed class RecordingExecutionContext : IExportJobExecutionContext
        {
            private readonly Dictionary<string, object?> _values = [];
            public string JobId => "job-1";
            public T? GetJobParameter<T>(string name) => Get<T>(name);
            public void SetJobParameter(string name, object? value) => _values[name] = value;
            public T? Get<T>(string name) => _values.TryGetValue(name, out var value) ? (T?)value : default;
        }

        private sealed class RecordingBackgroundJobClient : IBackgroundJobClient
        {
            public int CreateCalls { get; private set; }
            public Job? LastJob { get; private set; }
            public IState? LastState { get; private set; }

            public string Create(Job job, IState state) {
                CreateCalls++;
                LastJob = job;
                LastState = state;
                return "job-1";
            }

            public bool ChangeState(string jobId, IState state, string expectedState) =>
                throw new NotSupportedException();
        }

        private sealed class StaticStorageAccessor(HangfireJobSnapshot snapshot) : IHangfireJobStorageAccessor
        {
            public HangfireJobSnapshot? ReadJob(string jobId) => snapshot;
            public IReadOnlyList<string> ReadActiveJobIds() => ["job-1"];
        }

        private sealed class StaticOptionsMonitor<T>(T value) : IOptionsMonitor<T>
        {
            public T CurrentValue => value;
            public T Get(string? name) => value;
            public IDisposable? OnChange(Action<T, string?> listener) => null;
        }
    }
}
