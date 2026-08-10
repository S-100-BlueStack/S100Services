using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;
using System.Globalization;

namespace TestProductCatalogueAPI
{
    public class ExportJobMetadataClientFilterTests
    {
        [Fact]
        public void CreationParametersContainCompleteApplicationOwnedMetadata() {
            var createdAt = DateTimeOffset.Parse("2026-07-22T10:30:00+02:00");
            var request = new ExportOperationJobRequest(
                "101DK001",
                ExportOperationType.ExportEdition,
                "S100",
                4,
                2,
                "correlation-1",
                createdAt
            );

            var parameters = ExportJobMetadataClientFilter.CreateParameters(request);

            Assert.Equal("101DK001", parameters[ExportJobParameterNames.DatasetName]);
            Assert.Equal("ExportEdition", parameters[ExportJobParameterNames.OperationType]);
            Assert.Equal("S100", parameters[ExportJobParameterNames.ExportTarget]);
            Assert.Equal(4, parameters[ExportJobParameterNames.ExpectedEdition]);
            Assert.Equal(2, parameters[ExportJobParameterNames.ExpectedUpdate]);
            Assert.Equal("correlation-1", parameters[ExportJobParameterNames.CorrelationId]);
            Assert.Equal(
                createdAt.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
                parameters[ExportJobParameterNames.CreatedAtUtc]
            );
        }

        [Fact]
        public void RollbackMetadataPreservesNullExportTarget() {
            var request = new ExportOperationJobRequest(
                "101DK001",
                ExportOperationType.Rollback,
                null,
                4,
                2,
                "correlation-1",
                DateTimeOffset.UtcNow
            );

            var parameters = ExportJobMetadataClientFilter.CreateParameters(request);

            Assert.True(parameters.ContainsKey(ExportJobParameterNames.ExportTarget));
            Assert.Null(parameters[ExportJobParameterNames.ExportTarget]);
        }

        [Fact]
        public void NullableVersionMetadataIsNotNormalizedToZero() {
            var request = new ExportOperationJobRequest(
                "101DK001",
                ExportOperationType.Rollback,
                null,
                null,
                null,
                "correlation-1",
                DateTimeOffset.UtcNow
            );

            var parameters = ExportJobMetadataClientFilter.CreateParameters(request);

            Assert.Null(parameters[ExportJobParameterNames.ExpectedEdition]);
            Assert.Null(parameters[ExportJobParameterNames.ExpectedUpdate]);
        }

        [Theory]
        [InlineData("ExportEdition", null)]
        [InlineData("ExportEdition", "s100")]
        [InlineData("Rollback", "S100")]
        public void MalformedOperationMetadataIsRejected(
            string operationType,
            string? exportTarget
        ) {
            var operation = operationType == "Rollback"
                ? ExportOperationType.Rollback
                : ExportOperationType.ExportEdition;
            var request = new ExportOperationJobRequest(
                "101DK001",
                operation,
                exportTarget,
                4,
                2,
                "correlation-1",
                DateTimeOffset.UtcNow
            );

            Assert.Throws<InvalidOperationException>(() =>
                ExportJobMetadataClientFilter.CreateParameters(request)
            );
        }

        [Fact]
        public void ResultAndErrorMetadataAreNotWrittenDuringCreation() {
            var parameters = ExportJobMetadataClientFilter.CreateParameters(new ExportOperationJobRequest(
                "101DK001",
                ExportOperationType.ExportEdition,
                "S100",
                4,
                2,
                "correlation-1",
                DateTimeOffset.UtcNow
            ));

            Assert.False(parameters.ContainsKey(ExportJobParameterNames.ExecutionStarted));
            Assert.False(parameters.ContainsKey(ExportJobParameterNames.ResultCode));
            Assert.False(parameters.ContainsKey(ExportJobParameterNames.WarningCode));
            Assert.False(parameters.ContainsKey(ExportJobParameterNames.ErrorCode));
        }
    }
}
