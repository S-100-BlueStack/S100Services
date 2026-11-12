using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1
{
    public class PackageResponse
    {
        public required string Id { get; init; }

        public required string? Category { get; init; }

        public required string FileName { get; init; }

        public required string? AbsoluteUri { get; init; }

        /// <summary>The severity from the latest severity event.</summary>
        public ulong? Severity { get; init; }

        public PackageMetaData? MetaData { get; init; }

        /// <summary>Source description entries with optional part index/language and unchanged HTML.</summary>
        public PackageDescription[]? Descriptions { get; init; }

        /// <summary>Related chart numbers; null when no chart information is supplied.</summary>
        public PackageChart[]? Charts { get; init; }

        public DisplayScale? DisplayScale { get; init; }

        public DateTimeOffset? CreatedUTC { get; init; } = null;

        public DateTimeOffset LastUpdatedUtc { get; init; }

        /// <summary>All active pipeline assignments, ordered by pipeline ID, regardless of spatial/list filters.</summary>
        public IReadOnlyList<PackagePipelineBindingResponse> PipelineBindings { get; init; } = [];

        /// <summary>True when the package has at least one active pipeline assignment.</summary>
        public bool HasPipeline => this.PipelineBindings.Count > 0;
    }

    /// <summary>An active package-to-pipeline assignment without spatially derived workspace matches.</summary>
    /// <param name="Id">The existing binding identifier accepted by the dispatcher binding endpoints.</param>
    /// <param name="PipelineId">The assigned pipeline identifier.</param>
    public sealed record PackagePipelineBindingResponse(string Id, string PipelineId);

    public class FileResponse
    {
        public string? AbsoluteUri { get; init; }
    }
}
