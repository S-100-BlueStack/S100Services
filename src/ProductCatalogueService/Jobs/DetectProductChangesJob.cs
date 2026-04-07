using ProductCatalogueService.Data.Repositories;
using ProductCatalogueService.Services.ExchangeSet;
using ProductCatalogueService.Services.SevenCs;
using S100FC.ProductCatalogue;
using S100FC.YAML;

namespace ProductCatalogueService.Jobs
{
    public class DetectProductChangesJob(IProductRepository repository, IProductManager productManager, IExchangeSetService exchangeSetService, ISevenCsService sevenCsService, ILogger<DetectProductChangesJob> logger) : IBackgroundJob
    {
        private readonly IProductRepository _repository = repository;
        private readonly IProductManager _productManager = productManager;
        private readonly IExchangeSetService _exchangeSetService = exchangeSetService;
        private readonly ISevenCsService _sevenCsService = sevenCsService;
        private readonly ILogger<DetectProductChangesJob> _logger = logger;
        public async Task RunAsync(CancellationToken token) {
            _logger.LogInformation("Job: {jobName} started", nameof(DetectProductChangesJob));

            var output = _productManager.ElectronicProductManager.OutputFolder;
            var productNames = _productManager.ElectronicProductManager.ToArray();

            // InTransit, Frozen or somehow otherwise locked products
            var productsToSkip = await _repository.GetIneligbleProductsAsync();
            _logger.LogInformation("Frozen/InTransit products found: {count}", productsToSkip.Length);


            var products = productNames.Where(e => !productsToSkip.Contains(e));
            _logger.LogInformation("Checking for dirty in {count} products", products.Count());

            foreach (var productName in products) {
                var electronicProduct = _productManager.ElectronicProductManager.ElectronicProduct(productName);

                if (electronicProduct == null) {
                    _logger.LogError("Could not find electronic product with name: {name}", productName);
                    continue;
                }



                var dirtyFeatures = await _productManager.ElectronicProductManager.GetPendingEditsAsync(productName);

                if (dirtyFeatures.Count == 0)
                    continue;

                _logger.LogInformation("({count}) Pending edits detected for {dataset}", dirtyFeatures.Count, productName);

                // Look at all dirty features and decide if new edition or update
                var newEdition = IsNewEdition(dirtyFeatures);

                if (newEdition) {
                    _logger.LogInformation("Creating new edition.. ");
                    var dataset = await _productManager.ElectronicProductManager.CreateNewEditionAsync(productName);


                    var yaml = dataset.Serialize();


                    if (string.IsNullOrEmpty(yaml)) {
                        _logger.LogWarning("Failed to create new edition for dataset {dataset}.", productName);
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Invalid);
                        continue;
                    }

                    _logger.LogInformation("Creating export.. ");

                    var result = _exchangeSetService.CreateExchangeSet(electronicProduct, output, yaml);

                    // Validate .000 files
                    var summary = await _sevenCsService.ValidateDatasetAsync(electronicProduct, output);

                    // TODO: do something with validationresult. Rollback ed/update?
                    _logger.LogInformation("Saving productstate in database..");

                    if (summary.Errors == 0 & summary.Critical == 0)
                        await _repository.AppendAsync(productName, Data.Models.ProductState.NewEdition);
                    else
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Invalid);

                    // write to s128 database
                    _logger.LogInformation("Writing to s128.attachments.. ");
                    await _productManager.ElectronicProductManager.CreateAttachmentAsync(productName, ExportTypes.NewEdition, yaml, result.Index, result.Sign);

                }
                else {
                    _logger.LogInformation("Creating new update.. ");
                    var dataset = await _productManager.ElectronicProductManager.CreateNewUpdateAsync(productName);


                    var incoming = dataset.Serialize();


                    if (string.IsNullOrEmpty(incoming)) {
                        _logger.LogWarning("Failed to create new edition for dataset {dataset}.", productName);
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Invalid);
                        continue;
                    }

                    var (latest, prevIndex) = await _productManager.ElectronicProductManager.GetLatestDatasetYAML(productName, (int)dataset.Edition.Value);


                    // Build YAML Delta
                    var delta = S100FC.YAML.DatasetComparer.Compare(latest, incoming);

                    if (!delta.HasEdits) {
                        _logger.LogError("No edits found for product {product} during NewUpdate.", productName);
                        throw new InvalidOperationException($"No edits found for product {productName} during NewUpdate in {nameof(DetectProductChangesJob)}");
                    }


                    var update = S100FC.YAML.Converter.Serialize(delta);

                    _logger.LogInformation("Creating export.. ");
                    var result = _exchangeSetService.CreateExchangeSet(electronicProduct, output, update, prevIndex);

                    // Validate .000 files
                    var summary = await _sevenCsService.ValidateDatasetAsync(electronicProduct, output);

                    // TODO: do something with validationresult. Rollback ed/update?
                    _logger.LogInformation("Saving productstate in database..");

                    if (summary.Errors == 0 & summary.Critical == 0)
                        await _repository.AppendAsync(productName, Data.Models.ProductState.NewUpdate);
                    else 
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Invalid);
                    
                    _logger.LogInformation("Writing to s128.attachments.. ");
                    await _productManager.ElectronicProductManager.CreateAttachmentAsync(productName, ExportTypes.Update, update, result.Index, result.Sign);
                }
            }

            _logger.LogInformation("Job: {jobName} finished", nameof(DetectProductChangesJob));
        }


        private static bool IsNewEdition(Dictionary<string, ArchiveRow> features) {
            // TODO: Given ruleset, figure out if NewEdition or NewUpdate. For now just return true;
            return true;
        }
    }
}