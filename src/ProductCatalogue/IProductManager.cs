using S100FC.S128.FeatureTypes;

namespace S100FC.ProductCatalogue
{
    public interface INauticalProductManager
    {
    }

    public interface IElectronicProductManager : IEnumerable<string>
    {
        Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, /*S100FC.S128.SimpleAttributes.specificUsage specificUsage,*/ string boundary, int? optimumDisplayScale = null);

        Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, /*S100FC.S128.SimpleAttributes.specificUsage specificUsage,*/ string boundary, int edition, int update, byte[] zipfile);

        Task<YAML.Dataset> CreateNewDatasetAsync(string name);

        Task<YAML.Dataset> CreateNewEditionAsync(string name);

        Task<YAML.Dataset> CreateNewUpdateAsync(string name);

        Task<YAML.Dataset> ReissueAsync(string name);
        Task<bool> RollBackAsync(string name);
        Task<Dictionary<string, string>> GetDatasetAOIs();
        Task<bool> IsDirtyAsync(string name);
        Task<string> GetDatasetBoundary(string name);
        Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name);
        Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc);
        ElectronicProduct? ElectronicProduct(string name);

        Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition);
        Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign);
        Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml);

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
