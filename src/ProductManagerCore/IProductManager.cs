using S100FC.S128.ComplexAttributes;
using S100FC.S128.FeatureTypes;

namespace S100FC.ProductCatalogue
{
    public sealed record ElectronicProductVersion(
        string DatasetName,
        int? Edition,
        int? Update
    );

    public sealed class ProductDataIntegrityException(
        string datasetName,
        int exactMatchCount
    ) : Exception($"Multiple exact ElectronicProduct rows were found for dataset '{datasetName}'.")
    {
        public string DatasetName { get; } = datasetName;
        public int ExactMatchCount { get; } = exactMatchCount;
    }

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
        /// <param name="cancellationToken">Signals cancellation before or after the ArcGIS-dispatched snapshot build.</param>
        /// <returns>A read-only YAML dataset snapshot containing the requested candidate version.</returns>
        Task<YAML.Dataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default);
        Task<Dictionary<string, string>> GetDatasetAOIs();
        Task<bool> IsDirtyAsync(string name);
        Task<string> GetDatasetBoundary(string name);
        Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name);
        Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc);
        ElectronicProduct? ElectronicProduct(string name);
        Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(
            string datasetName,
            CancellationToken cancellationToken = default
        );

        Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition);
        Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign);
        Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml);
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
