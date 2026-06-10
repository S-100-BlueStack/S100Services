namespace ProductCatalogueAPI.Services.Export
{
    public interface IExportService
    {
        ExportResult CreateS100Export(string datasetName, int editionNo, int updateNo, string outputFolder, string yaml, string prevIndex = "");
        bool DeleteExport(string datasetName, string outputFolder, int editionNo, int? updateNo = null);

        int CreateS57Export(string datasetName, int editionNo, int updateNo, string outputFolder, string yaml);
    }
    public record ExportResult(string Index, string Sign);
}
