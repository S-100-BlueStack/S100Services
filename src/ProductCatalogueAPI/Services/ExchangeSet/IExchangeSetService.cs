namespace ProductCatalogueAPI.Services.ExchangeSet
{
    public interface IExchangeSetService
    {
        ExchangeSetResult CreateExchangeSet(S100FC.S128.FeatureTypes.ElectronicProduct product, string outputFolder, string yaml, string prevIndex = "");
        void DeleteExchangeSet(string datasetName, int editionNumber, string outputFolder);
    }
    public record ExchangeSetResult(string Index, string Sign);
}
