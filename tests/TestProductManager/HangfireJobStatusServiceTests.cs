using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Jobs;
using System.Text.Json;

namespace TestProductCatalogueAPI
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
        public void CancelExportWarningIsReturnedFromPersistentMetadata() {
            var parameters = RequiredParameters("CancelExport", exportTarget: "S101");
            parameters[ExportJobParameterNames.ResultCode] = Json("CANCEL_EXPORT_COMPLETED");
            parameters[ExportJobParameterNames.ResultMessage] = Json("Cancel export completed.");
            parameters[ExportJobParameterNames.WarningCode] = Json("CANCEL_EXPORT_CLEANUP_FAILED");
            parameters[ExportJobParameterNames.WarningMessage] = Json("Cancel export completed with a cleanup warning.");

            var response = Service(new HangfireJobSnapshot(
                parameters,
                [new HangfireStateSnapshot("Succeeded", Utc(10, 5))]
            )).GetJob("job-1");

            Assert.Equal("Succeeded", response!.Status);
            Assert.Equal("CANCEL_EXPORT_CLEANUP_FAILED", response.Warning!.Code);
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
        public void ProductOperationRejectionReturnsSpecificSafeMessage() {
            var parameters = RequiredParameters();
            parameters[ExportJobParameterNames.ErrorCode] = Json(
                ExportJobContract.ProductOperationRejectedCode
            );
            parameters[ExportJobParameterNames.ErrorMessage] = Json(
                "A New edition could not be created now. Current product state: Exported."
            );

            var response = Service(new HangfireJobSnapshot(
                parameters,
                [new HangfireStateSnapshot("Failed", Utc(10, 5))]
            )).GetJob("job-1");

            Assert.Equal(
                ExportJobContract.ProductOperationRejectedCode,
                response!.Error!.Code
            );
            Assert.Equal(
                "A New edition could not be created now. Current product state: Exported.",
                response.Error.Message
            );
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
        public void ActiveJobsReturnOnlyMatchingQueuedAndRunningJobs() {
            var snapshots = new Dictionary<string, HangfireJobSnapshot>(StringComparer.Ordinal) {
                ["job-1"] = Snapshot("Enqueued"),
                ["job-2"] = Snapshot("Processing"),
                ["job-3"] = new HangfireJobSnapshot(
                    RequiredParameters(datasetName: "101DK999"),
                    [new HangfireStateSnapshot("Processing", Utc(10, 1))]
                ),
                ["job-4"] = Snapshot("Failed")
            };
            var service = Service(new MultiFakeAccessor(snapshots));

            var active = service.GetActiveJobs("101dk001");

            Assert.Equal(new[] { "job-1", "job-2" }, active.Select(job => job.JobId).ToArray());
            Assert.All(active, job => Assert.Contains(job.Status, new[] { "Queued", "Running" }));
        }

        [Fact]
        public void ActiveJobsControllerReturnsEmptyListWhenNoJobIsActive() {
            var controller = new JobsController(new NullJobStatusService());

            var result = controller.GetActiveJobs("101DK001");

            var ok = Assert.IsType<OkObjectResult>(result);
            Assert.Empty(Assert.IsAssignableFrom<IReadOnlyList<ExportJobStatusResponse>>(ok.Value));
        }

        [Fact]
        public void ActiveJobsControllerRequiresDatasetName() {
            var controller = new JobsController(new NullJobStatusService());

            var result = controller.GetActiveJobs(" ");

            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status400BadRequest, objectResult.StatusCode);
            var error = Assert.IsType<ExportJobErrorResponse>(objectResult.Value);
            Assert.Equal(ExportJobContract.DatasetNameRequiredCode, error.Code);
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
            Assert.Null(Service((HangfireJobSnapshot?)null).GetJob("missing"));

            var incomplete = new HangfireJobSnapshot(
                new Dictionary<string, string?>(),
                [new HangfireStateSnapshot("Enqueued", Utc(10, 0))]
            );
            Assert.Null(Service(incomplete).GetJob("other-job"));
        }

        private static HangfireJobStatusService Service(HangfireJobSnapshot? snapshot) =>
            Service(new FakeAccessor(snapshot));

        private static HangfireJobStatusService Service(IHangfireJobStorageAccessor accessor) => new(
            accessor,
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
            string? exportTarget = "S101",
            string datasetName = "101DK001"
        ) => new(StringComparer.Ordinal) {
            [ExportJobParameterNames.DatasetName] = Json(datasetName),
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
            public IReadOnlyList<ExportJobStatusResponse> GetActiveJobs(string datasetName) => [];
        }

        private sealed class FakeAccessor(HangfireJobSnapshot? snapshot) : IHangfireJobStorageAccessor
        {
            public HangfireJobSnapshot? ReadJob(string jobId) => snapshot;
            public IReadOnlyList<string> ReadActiveJobIds() => snapshot == null ? [] : ["job-1"];
        }

        private sealed class MultiFakeAccessor(
            IReadOnlyDictionary<string, HangfireJobSnapshot> snapshots
        ) : IHangfireJobStorageAccessor
        {
            public HangfireJobSnapshot? ReadJob(string jobId) =>
                snapshots.TryGetValue(jobId, out var snapshot) ? snapshot : null;

            public IReadOnlyList<string> ReadActiveJobIds() => snapshots.Keys.ToArray();
        }
    }
}
