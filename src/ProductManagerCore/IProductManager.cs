using S100FC.S128.ComplexAttributes;
using S100FC.S128.FeatureTypes;

namespace S100FC.ProductCatalogue
{
    public sealed record ElectronicProductVersion(
        string DatasetName,
        int? Edition,
        int? Update
    );

    /// <summary>Pairs the shared YAML snapshot with changed source features actually selected for its topology.</summary>
    public sealed record VerifiedExportSnapshot(YAML.Dataset Dataset, IReadOnlyCollection<string> IncludedChangedFeatureIds);

    /// <summary>Contains the accepted versions and the immutable source snapshot to publish together in S-128.</summary>
    public sealed record EncPackagePublication(Guid PackageId, string S57DatasetName, int S57Edition, int S57Update, string S101DatasetName, int S101Edition, int S101Update, DateTime DetectedAtUtc, string DatasetYaml, byte[] CompilerIndex, byte[] CatalogueSignature);

    public sealed class ProductDataIntegrityException(
        string datasetName,
        int exactMatchCount
    ) : Exception($"Multiple exact ElectronicProduct rows were found for dataset '{datasetName}'.")
    {
        public string DatasetName { get; } = datasetName;
        public int ExactMatchCount { get; } = exactMatchCount;
    }

    public sealed class ProductMappingIntegrityException(string message) : Exception(message);

    public interface INauticalProductManager
    {
    }

    public interface IElectronicProductManager : IEnumerable<string>
    {
        Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null);

        Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, /*S100FC.S128.SimpleAttributes.specificUsage specificUsage,*/ string boundary, int edition, int update, byte[] zipfile);

        Task<YAML.Dataset> CreateNewDatasetAsync(string name);

        Task<YAML.Dataset> CreateNewEditionAsync(string name);

        Task<YAML.Dataset> CreateNewUpdateAsync(string name);

        Task<YAML.Dataset> ReissueAsync(string name);

        /// <summary>
        /// Builds an export candidate at an explicit version without changing the S-128 ElectronicProduct or attachment tables.
        /// </summary>
        /// <param name="name">The S-128 dataset name used to select the product coverage.</param>
        /// <param name="exportType">The candidate revision type.</param>
        /// <param name="edition">The SQL-authoritative candidate edition.</param>
        /// <param name="update">The SQL-authoritative candidate update.</param>
        /// <param name="cancellationToken">Signals cancellation before dispatch and between substantial snapshot-processing phases. An ArcGIS call already in progress cannot be interrupted unless that API supports cancellation.</param>
        /// <returns>A read-only YAML dataset snapshot containing the requested candidate version.</returns>
        Task<YAML.Dataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default);
        /// <summary>Reports which edited features belong to the actual export selection; implementations must not guess.</summary>
        Task<VerifiedExportSnapshot> CreateVerifiedExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, IReadOnlyCollection<string> requiredFeatureIds, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException("This product manager cannot verify the ENC export selection.");
        Task<Dictionary<string, string>> GetDatasetAOIs();
        Task<Dictionary<string, string>> GetDatasetAOIs(string productSpecification);
        Task<bool> IsDirtyAsync(string name);
        Task<string> GetDatasetBoundary(string name);
        Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name);
        Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc);
        ElectronicProduct? ElectronicProduct(string name);
        ElectronicProduct? ElectronicProduct(string name, string productSpecification);
        /// <summary>
        /// Resolves the product represented by a dataset name using its S-128 catalogue identity.
        /// </summary>
        /// <param name="name">The dataset name supplied by the caller.</param>
        /// <returns>The uniquely identified product, or <see langword="null"/> when it is not present.</returns>
        ElectronicProduct? ResolveExportProduct(string name) => null;
        ElectronicProduct? ResolveElectronicProduct(string name, string productSpecification) => ElectronicProduct(name, productSpecification);
        IReadOnlyList<ElectronicProduct> GetMappedElectronicProducts(string name, string productSpecification) => [];
        Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(
            string datasetName,
            CancellationToken cancellationToken = default
        );
        Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(
            string datasetName,
            string productSpecification,
            CancellationToken cancellationToken = default
        ) => ReadElectronicProductVersionAsync(datasetName, cancellationToken);

        Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition);
        Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign);
        Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml);
        /// <summary>Atomically publishes both accepted ENC versions and their shared YAML attachment; repeating the same package is safe.</summary>
        Task PublishAcceptedEncPackageAsync(EncPackagePublication publication, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException("This product manager does not support publishing accepted ENC packages.");
        //Task CreateElectronicProductAsync(string name, productSpecification productSpecification, string boundary, int? optimumDisplayScale, string ProductMapping);

        string OutputFolder { get; }
    }

    public interface IProductManager
    {
        INauticalProductManager NauticalProductManager { get; }

        IElectronicProductManager ElectronicProductManager { get; }

        //Task Dispatch(Action action);

        //Task<TResult> Dispatch<TResult>(Func<TResult> function);
    }
}
