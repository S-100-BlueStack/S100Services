using Hangfire.Client;
using Hangfire.Common;
using ProductManagerAPI.Services.Operations;
using System.Globalization;

namespace ProductManagerAPI.Jobs
{
    public sealed class ExportJobMetadataClientFilter : JobFilterAttribute, IClientFilter
    {
        public void OnCreating(CreatingContext context) {
            if (context.Job.Type != typeof(ExportOperationJob))
                return;

            var request = context.Job.Args
                .OfType<ExportOperationJobRequest>()
                .SingleOrDefault();

            if (request == null)
                throw new InvalidOperationException("The ExportOperationJob request is missing or malformed.");

            foreach (var parameter in CreateParameters(request))
                context.SetJobParameter(parameter.Key, parameter.Value!);
        }

        public static IReadOnlyDictionary<string, object?> CreateParameters(
            ExportOperationJobRequest request
        ) {
            ArgumentNullException.ThrowIfNull(request);
            ValidateRequest(request);

            return new Dictionary<string, object?>(StringComparer.Ordinal) {
                [ExportJobParameterNames.DatasetName] = request.DatasetName,
                [ExportJobParameterNames.OperationType] = ExportOperationContract.ToPublicValue(request.OperationType),
                [ExportJobParameterNames.ExportTarget] = request.ExportTarget,
                [ExportJobParameterNames.ExpectedEdition] = request.ExpectedEdition,
                [ExportJobParameterNames.ExpectedUpdate] = request.ExpectedUpdate,
                [ExportJobParameterNames.CorrelationId] = request.CorrelationId,
                [ExportJobParameterNames.CreatedAtUtc] = request.CreatedAtUtc
                    .ToUniversalTime()
                    .ToString("O", CultureInfo.InvariantCulture)
            };
        }


        private static void ValidateRequest(ExportOperationJobRequest request) {
            if (string.IsNullOrWhiteSpace(request.DatasetName))
                throw new InvalidOperationException("The Product Manager dataset name is missing.");
            if (string.IsNullOrWhiteSpace(request.CorrelationId))
                throw new InvalidOperationException("The Product Manager correlation ID is missing.");

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

        public void OnCreated(CreatedContext context) {
        }
    }
}
