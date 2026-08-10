using Hangfire.Client;
using Hangfire.Common;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Operations;
using System.Globalization;

namespace ProductCatalogueAPI.Jobs
{
    public sealed class ExportJobMetadataClientFilter : JobFilterAttribute, IClientFilter
    {
        public void OnCreating(CreatingContext context) {
            IReadOnlyDictionary<string, object?>? parameters = context.Job.Type switch {
                var type when type == typeof(ExportOperationJob) => CreateParameters(
                    context.Job.Args.OfType<ExportOperationJobRequest>().SingleOrDefault()
                        ?? throw new InvalidOperationException(
                            "The ExportOperationJob request is missing or malformed."
                        )
                ),
                var type when type == typeof(UploadSingularProductJob) => CreateParameters(
                    context.Job.Args.OfType<SendToIcEncJobRequest>().SingleOrDefault()
                        ?? throw new InvalidOperationException(
                            "The UploadSingularProductJob request is missing or malformed."
                        )
                ),
                _ => null
            };

            if (parameters == null)
                return;

            foreach (var parameter in parameters)
                context.SetJobParameter(parameter.Key, parameter.Value!);
        }

        public static IReadOnlyDictionary<string, object?> CreateParameters(
            ExportOperationJobRequest request
        ) {
            ArgumentNullException.ThrowIfNull(request);
            ValidateRequest(request);

            return CreateSharedParameters(
                request.DatasetName,
                ExportOperationContract.ToPublicValue(request.OperationType),
                request.ExportTarget,
                request.ExpectedEdition,
                request.ExpectedUpdate,
                request.CorrelationId,
                request.CreatedAtUtc
            );
        }

        public static IReadOnlyDictionary<string, object?> CreateParameters(
            SendToIcEncJobRequest request
        ) {
            ArgumentNullException.ThrowIfNull(request);
            ValidateRequest(request);

            var parameters = CreateSharedParameters(
                request.DatasetName,
                SendToIcEncContract.OperationType,
                exportTarget: null,
                request.ExpectedEdition,
                request.ExpectedUpdate,
                request.CorrelationId,
                request.CreatedAtUtc
            ).ToDictionary(parameter => parameter.Key, parameter => parameter.Value, StringComparer.Ordinal);
            parameters[ExportJobParameterNames.Mode] = SendToIcEncContract.SimulationMode;
            parameters[ExportJobParameterNames.DeliveryStatus] = SendToIcEncContract.NotDeliveredStatus;

            return parameters;
        }

        private static IReadOnlyDictionary<string, object?> CreateSharedParameters(
            string datasetName,
            string operationType,
            string? exportTarget,
            int? expectedEdition,
            int? expectedUpdate,
            string correlationId,
            DateTimeOffset createdAtUtc
        ) => new Dictionary<string, object?>(StringComparer.Ordinal) {
            [ExportJobParameterNames.DatasetName] = datasetName,
            [ExportJobParameterNames.OperationType] = operationType,
            [ExportJobParameterNames.ExportTarget] = exportTarget,
            [ExportJobParameterNames.ExpectedEdition] = expectedEdition,
            [ExportJobParameterNames.ExpectedUpdate] = expectedUpdate,
            [ExportJobParameterNames.CorrelationId] = correlationId,
            [ExportJobParameterNames.CreatedAtUtc] = createdAtUtc
                .ToUniversalTime()
                .ToString("O", CultureInfo.InvariantCulture)
        };

        private static void ValidateRequest(ExportOperationJobRequest request) {
            ValidateSharedRequest(request.DatasetName, request.CorrelationId);

            if (request.OperationType == ExportOperationType.ExportEdition &&
                !string.Equals(request.ExportTarget, "S100", StringComparison.Ordinal)) {
                throw new InvalidOperationException(
                    "ExportEdition jobs require the canonical S100 export target."
                );
            }

            if (request.OperationType == ExportOperationType.Rollback &&
                request.ExportTarget != null) {
                throw new InvalidOperationException(
                    "Rollback jobs must not include an export target."
                );
            }
        }

        private static void ValidateRequest(SendToIcEncJobRequest request) {
            ValidateSharedRequest(request.DatasetName, request.CorrelationId);

            if (request.Mode != SendToIcEncMode.Simulation) {
                throw new InvalidOperationException(
                    "Send to IC-ENC jobs must use the Simulation mode."
                );
            }
        }

        private static void ValidateSharedRequest(string datasetName, string correlationId) {
            if (string.IsNullOrWhiteSpace(datasetName))
                throw new InvalidOperationException("The Product Manager dataset name is missing.");
            if (string.IsNullOrWhiteSpace(correlationId))
                throw new InvalidOperationException("The Product Manager correlation ID is missing.");
        }

        public void OnCreated(CreatedContext context) {
        }
    }
}
