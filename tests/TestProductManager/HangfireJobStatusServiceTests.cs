using ProductManagerAPI.Models;
using ProductManagerAPI.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ProductManagerAPI.Jobs;
using ProductManagerAPI.Services.Jobs;
using System.Text.Json;

namespace TestProductManagerAPI
{
    public class HangfireJobStatusServiceTests
    {
        [Theory]
        [InlineData("Enqueued", "Queued")]
        [InlineData("Scheduled", "Queued")]
        [InlineData("Awaiting", "Queued")]
        [InlineData("Processing", "Running")]
        [InlineData("Succeeded", "Succeeded")]
        [InlineData("Failed", "Failed")]
        [InlineData("Deleted", "Cancelled")]
        public void HangfireStatesMapToPublicStates(string state, string expected) {
            var response = Service(Snapshot(state)).GetJob("job-1");

            Assert.NotNull(response);
            Assert.Equal(expected, response!.Status);
        }

        [Fact]
        public void StartedAtUsesEarliestProcessingState() {
            var snapshot = Snapshot(
                "Succeeded",
                new HangfireStateSnapshot("Processing", Utc(10, 5)),
                new HangfireStateSnapshot("Processing", Utc(10, 10)),
                new HangfireStateSnapshot("Succeeded", Utc(10, 15))
            );

            var response = Service(snapshot).GetJob("job-1");

            Assert.Equal(new DateTimeOffset(Utc(10, 5)), response!.StartedAt);
            Assert.Equal(new DateTimeOffset(Utc(10, 15)), response.CompletedAt);
        }

        [Fact]
        public void CurrentNonTerminalStateHasNoCompletedAt() {
            var snapshot = Snapshot(
                "Processing",
                new HangfireStateSnapshot("Succeeded", Utc(10, 1)),
                new HangfireStateSnapshot("Processing", Utc(10, 2))
            );

            var response = Service(snapshot).GetJob("job-1");

            Assert.Equal("Running", response!.Status);
            Assert.Null(response.CompletedAt);
        }

        [Fact]
        public void RollbackCleanupWarningIsReturnedFromPersistentMetadata() {
            var parameters = RequiredParameters("Rollback", exportTarget: null);
            parameters[ExportJobParameterNames.ResultCode] = Json("ROLLBACK_COMPLETED");
            parameters[ExportJobParameterNames.ResultMessage] = Json("Rollback completed.");
            parameters[ExportJobParameterNames.WarningCode] = Json("ROLLBACK_CLEANUP_FAILED");
            parameters[ExportJobParameterNames.WarningMessage] = Json("Rollback completed, but old export output could not be fully removed.");

            var response = Service(new HangfireJobSnapshot(
                parameters,
                [new HangfireStateSnapshot("Succeeded", Utc(10, 5))]
            )).GetJob("job-1");

            Assert.Equal("Succeeded", response!.Status);
            Assert.Equal("ROLLBACK_CLEANUP_FAILED", response.Warning!.Code);
            Assert.Null(response.Error);
        }

        [Fact]
        public void ProductDataIntegrityFailureReturnsOnlySafeMetadata() {
            var parameters = RequiredParameters();
            parameters[ExportJobParameterNames.ErrorCode] = Json(ExportJobContract.ProductDataIntegrityErrorCode);
            parameters[ExportJobParameterNames.ErrorMessage] = Json(ExportJobContract.ProductDataIntegrityJobMessage);

            var response = Service(new HangfireJobSnapshot(
                parameters,
                [new HangfireStateSnapshot("Failed", Utc(10, 5))]
            )).GetJob("job-1");

            Assert.Equal(ExportJobContract.ProductDataIntegrityErrorCode, response!.Error!.Code);
            Assert.Equal(ExportJobContract.ProductDataIntegrityJobMessage, response.Error.Message);
            Assert.False(response.Error.Message.Contains("ArcGIS", StringComparison.OrdinalIgnoreCase));
        }

        [Fact]
        public void FailedJobWithoutSafeMetadataUsesGenericFallback() {
            var response = Service(Snapshot("Failed")).GetJob("job-1");

            Assert.Equal(ExportJobContract.JobFailedCode, response!.Error!.Code);
            Assert.Equal(ExportJobContract.JobFailedMessage, response.Error.Message);
        }

        [Fact]
        public void NullExpectedVersionMetadataIsNotExposed() {
            var parameters = RequiredParameters();
            parameters[ExportJobParameterNames.ExpectedEdition] = Json<int?>(null);

            var response = Service(new HangfireJobSnapshot(
                parameters,
                [new HangfireStateSnapshot("Enqueued", Utc(10, 0))]
            )).GetJob("job-1");

            Assert.Null(response);
        }


        [Fact]
        public void UnknownJobControllerResponseUsesSafeCodeAndMessage() {
            var controller = new JobsController(new NullJobStatusService());

            var result = controller.GetJob("missing");

            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status404NotFound, objectResult.StatusCode);
            Assert.Contains("application/json", objectResult.ContentTypes);
            var error = Assert.IsType<ExportJobErrorResponse>(objectResult.Value);
            Assert.Equal(ExportJobContract.JobNotFoundCode, error.Code);
            Assert.Equal(ExportJobContract.JobNotFoundMessage, error.Message);
        }

        [Fact]
        public void UnknownOrIncompleteJobReturnsNull() {
            Assert.Null(Service(null).GetJob("missing"));

            var incomplete = new HangfireJobSnapshot(
                new Dictionary<string, string?>(),
                [new HangfireStateSnapshot("Enqueued", Utc(10, 0))]
            );
            Assert.Null(Service(incomplete).GetJob("other-job"));
        }

        private static HangfireJobStatusService Service(HangfireJobSnapshot? snapshot) => new(
            new FakeAccessor(snapshot),
            NullLogger<HangfireJobStatusService>.Instance
        );

        private static HangfireJobSnapshot Snapshot(
            string currentState,
            params HangfireStateSnapshot[] history
        ) {
            var states = history.Length == 0
                ? [new HangfireStateSnapshot(currentState, Utc(10, 0))]
                : history;

            return new HangfireJobSnapshot(RequiredParameters(), states);
        }

        private static Dictionary<string, string?> RequiredParameters(
            string operationType = "ExportEdition",
            string? exportTarget = "S100"
        ) => new(StringComparer.Ordinal) {
            [ExportJobParameterNames.DatasetName] = Json("101DK001"),
            [ExportJobParameterNames.OperationType] = Json(operationType),
            [ExportJobParameterNames.ExportTarget] = Json(exportTarget),
            [ExportJobParameterNames.ExpectedEdition] = Json(4),
            [ExportJobParameterNames.ExpectedUpdate] = Json(2),
            [ExportJobParameterNames.CorrelationId] = Json("correlation-1"),
            [ExportJobParameterNames.CreatedAtUtc] = Json("2026-07-22T08:00:00.0000000Z")
        };

        private static string Json<T>(T value) => JsonSerializer.Serialize(value);

        private static DateTime Utc(int hour, int minute) => new(
            2026,
            7,
            22,
            hour,
            minute,
            0,
            DateTimeKind.Utc
        );


        private sealed class NullJobStatusService : IJobStatusService
        {
            public ExportJobStatusResponse? GetJob(string jobId) => null;
        }

        private sealed class FakeAccessor(HangfireJobSnapshot? snapshot) : IHangfireJobStorageAccessor
        {
            public HangfireJobSnapshot? ReadJob(string jobId) => snapshot;
        }
    }
}
