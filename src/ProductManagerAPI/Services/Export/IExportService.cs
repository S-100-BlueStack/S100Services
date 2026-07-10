namespace ProductManagerAPI.Services.Export
{
    public interface IExportService
    {
        ExportResult CreateS100Export(string datasetName, uint editionNo, uint? updateNo, string outputFolder, string yaml, string prevIndex = "");
        bool DeleteExport(string datasetName, string outputFolder, uint editionNo, uint? updateNo = 0);

        int CreateS57Export(string datasetName, uint editionNo, uint? updateNo, string outputFolder, string yaml);
    }
    public record ExportResult(string Index, string Sign);
}
