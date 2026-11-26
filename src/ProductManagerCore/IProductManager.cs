using ArcGIS.Core.Geometry;
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
    public sealed record VerifiedExportSnapshot(YAML.Dataset Dataset, IReadOnlyCollection<string> IncludedChangedFeatureIds)
    {
        // Exact redundant metadata surfaces omitted from the feature collection.
        // Remains empty for managers which do not implement metadata normalization.
        public IReadOnlyList<string> SuppressedMetadataSurfaces { get; init; } = [];
    }

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
        /// <summary>Creates an S-128 ElectronicProduct with an optional ProductMapping to an existing ElectronicProduct.</summary>
        /// <param name="name">Unique dataset name of the new product.</param>
        /// <param name="productSpecification">Specification of the new product.</param>
        /// <param name="specificUsage">Optional specific usage value.</param>
        /// <param name="boundary">Product boundary in Esri JSON format.</param>
        /// <param name="ProductMapping">Existing target dataset name, or null or whitespace for no association.</param>
        /// <param name="optimumDisplayScale">Optional optimum display scale.</param>
        /// <returns>A task that completes when product creation has finished.</returns>
        /// <exception cref="ProductMappingIntegrityException">The requested target is missing, ambiguous or cannot be resolved.</exception>
        Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null);

        /// <summary>Creates an ElectronicProduct with an explicit source identifier on its geodatabase row.</summary>
        /// <param name="name">Unique dataset name of the new product.</param>
        /// <param name="productSpecification">Specification of the new product.</param>
        /// <param name="specificUsage">Optional specific usage value.</param>
        /// <param name="boundary">Product boundary in Esri JSON format.</param>
        /// <param name="ProductMapping">Existing target dataset name, or null or whitespace for no association.</param>
        /// <param name="optimumDisplayScale">Optional optimum display scale.</param>
        /// <param name="sourceIdentifier">Integer identifier stored in the S-100 surface sourceIdentifier column.</param>
        /// <returns>A task that completes when product creation has finished.</returns>
        /// <exception cref="NotSupportedException">The manager does not support explicit source identifiers.</exception>
        /// <exception cref="ProductMappingIntegrityException">The requested mapping target cannot be resolved.</exception>
        Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale, int sourceIdentifier) =>
            throw new NotSupportedException("This product manager does not support explicit source identifiers.");

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

        /// <summary>Reads actual S-128 dataset footprints for the specified product type.</summary>
        /// <param name="productSpecification">Product specification used to select catalogue rows.</param>
        /// <param name="cancellationToken">Cancels the scan between rows.</param>
        /// <returns>Immutable polygon geometries keyed by dataset name in their stored spatial reference.</returns>
        /// <exception cref="NotSupportedException">The product manager does not provide direct S-128 geometry access.</exception>
        Task<Dictionary<string, Polygon>> GetDatasetAoiGeometriesAsync(string productSpecification, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException("The product manager does not provide S-128 AOI geometries.");
        Task<bool> IsDirtyAsync(string name);
        Task<string> GetDatasetBoundary(string name);
        Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name);
        Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc);
        /// <summary>Returns net archive changes between an exclusive UTC cursor and an inclusive, fixed UTC cutoff.</summary>
        Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc, DateTime throughUtc) =>
            throw new NotSupportedException("This product manager does not support bounded UTC archive scans.");
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
