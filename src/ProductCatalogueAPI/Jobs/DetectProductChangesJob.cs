using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC.ProductCatalogue;
using S100FC.YAML;

namespace ProductCatalogueAPI.Jobs
{
    public class DetectProductChangesJob(IProductRepository repository, IProductManager productManager, IExportService exportService, ISevenCsService sevenCsService, ILogger<DetectProductChangesJob> logger) : IBackgroundJob
    {
        private readonly IProductRepository _repository = repository;
        private readonly IProductManager _productManager = productManager;
        private readonly IExportService _exportService = exportService;
        private readonly ISevenCsService _sevenCsService = sevenCsService;
        private readonly ILogger<DetectProductChangesJob> _logger = logger;


        public async Task RunAsync(CancellationToken cancellationToken) {
            var jobName = nameof(DetectProductChangesJob);
            var scanStartedUtc = DateTime.UtcNow;
            var initialImportDate = new DateTime(2026, 04, 12);
            var sinceUtc = await _repository.GetLastSuccessfulRunUtcAsync(jobName);

            if (sinceUtc == null) {
                await _repository.SetSuccessfulRunUtcAsync(
                    jobName,
                    initialImportDate);

                _logger.LogInformation(
                    "Initialized job watermark for {jobName} at {scanStartedUtc}. No scan performed.",
                    jobName,
                    initialImportDate);

                return;
            }

            _logger.LogInformation("Job: {jobName} started. Last successful run at: {lastRun}", jobName, sinceUtc);


            var output = _productManager.ElectronicProductManager.OutputFolder;

            var pendingEdits = await _productManager.ElectronicProductManager.GetPendingEditsAsync(sinceUtc.Value);

            _logger.LogInformation("Products found with pending edits: {count}", pendingEdits.Count);

            foreach (var productChange in pendingEdits) {
                cancellationToken.ThrowIfCancellationRequested();
                var productName = productChange.Key;
                var dirtyFeatures = productChange.Value;

                if (dirtyFeatures.Values.Count == 0)
                    continue;

                var electronicProduct = _productManager.ElectronicProductManager.ElectronicProduct(productName);

                if (electronicProduct == null) {
                    _logger.LogError("Failed to retrieve electronic product for {productName}. Skipping.", productName);
                    continue;
                }

                // TODO: Skip frozen products? Figure out how to deal with the SuccesfulRun timestamp being past a skipped products updates then.

                _logger.LogInformation("({count}) Pending edits detected for {dataset}", dirtyFeatures.Count, productName);

                // Look at all dirty features and decide if new edition or update
                var newEdition = IsNewEdition(dirtyFeatures);

                if (newEdition) {
                    _logger.LogInformation("Creating new edition.. ");
                    var dataset = await _productManager.ElectronicProductManager.CreateNewEditionAsync(productName);


                    var yaml = dataset.Serialize();


                    if (string.IsNullOrEmpty(yaml)) {
                        _logger.LogWarning("Failed to create new edition for dataset {dataset}.", productName);
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Frozen, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");
                        continue;
                    }

                    _logger.LogInformation("Creating export.. ");
                    var result = _exportService.CreateS100Export(productName, (int)dataset.Edition!, (int)dataset.Update!, output, yaml);

                    // Validate .000 files
                    _logger.LogInformation("Validating .000 files with SevenCs.. ");
                    try {
                        var summary = await _sevenCsService.ValidateDatasetAsync(electronicProduct, output);

                        if (summary.Errors == 0 & summary.Critical == 0) {
                            await _repository.AppendAsync(productName, Data.Models.ProductState.Exported, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");
                            // write to s128 database
                            _logger.LogInformation("Writing to s128.attachments.. ");
                            await _productManager.ElectronicProductManager.CreateAttachmentAsync(productName, ExportTypes.NewEdition, yaml, result.Index, result.Sign);
                        }
                        else {
                            _logger.LogWarning("Product {product} failed the SevenCs Validation check. Errors: {err}. Critical: {crit}. Marking product as Invalid.", productName, summary.Errors, summary.Critical);

                            await _repository.AppendAsync(productName, Data.Models.ProductState.Frozen, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");

                            _logger.LogInformation("Rolling back export creation.. ");
                            _exportService.DeleteExport(productName, output, electronicProduct.editionNumber!.Value, electronicProduct.updateNumber);
                        }
                    }
                    catch (Exception ex) {
                        _logger.LogWarning(ex, "An error occurred during SevenCs validation for product {product}. Assume validation was succesful for now.", productName);
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Exported, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");
                        // write to s128 database
                        _logger.LogInformation("Writing to s128.attachments.. ");
                        await _productManager.ElectronicProductManager.CreateAttachmentAsync(productName, ExportTypes.NewEdition, yaml, result.Index, result.Sign);
                    }
                }
                else {
                    _logger.LogInformation("Creating new update.. ");
                    var dataset = await _productManager.ElectronicProductManager.CreateNewUpdateAsync(productName);


                    var incoming = dataset.Serialize();


                    if (string.IsNullOrEmpty(incoming)) {
                        _logger.LogWarning("Failed to create new edition for dataset {dataset}.", productName);
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Frozen, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");
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
                    var result = _exportService.CreateS100Export(productName, (int)dataset.Edition!, (int)dataset.Update!, output, update, prevIndex);
                    // Validate .000 files
                    _logger.LogInformation("Validating .000 files with SevenCs.. ");
                    try {
                        // Validate .000 files
                        var summary = await _sevenCsService.ValidateDatasetAsync(electronicProduct, output);

                        _logger.LogInformation("Saving productstate in database..");

                        if (summary.Errors == 0 & summary.Critical == 0) {
                            await _repository.AppendAsync(productName, Data.Models.ProductState.Exported, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");

                            _logger.LogInformation("Writing to s128.attachments.. ");
                            await _productManager.ElectronicProductManager.CreateAttachmentAsync(productName, ExportTypes.Update, update, result.Index, result.Sign);
                        }

                        else {
                            _logger.LogWarning("Product {product} failed the SevenCs Validation check. Errors: {err}. Critical: {crit}. Marking product as Frozen.", productName, summary.Errors, summary.Critical);

                            await _repository.AppendAsync(productName, Data.Models.ProductState.Frozen, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");

                            _logger.LogInformation("Rolling back export creation.. ");
                            _exportService.DeleteExport(productName, output, electronicProduct.editionNumber!.Value, electronicProduct.updateNumber);
                        }
                    }
                    catch (Exception ex) {
                        // TODO: This is a temporary solution to avoid blocking exports due to issues with SevenCs.
                        _logger.LogWarning(ex, "An error occurred during SevenCs validation for product {product}. Assume validation was succesful for now.", productName);
                        await _repository.AppendAsync(productName, Data.Models.ProductState.Exported, "S-101", (int)dataset.Edition!, (int)dataset.Update!, "system");

                        _logger.LogInformation("Writing to s128.attachments.. ");
                        await _productManager.ElectronicProductManager.CreateAttachmentAsync(productName, ExportTypes.Update, update, result.Index, result.Sign);
                    }
                }
            }
            _logger.LogInformation("Setting successful run for job: {jobName} at {time}", jobName, scanStartedUtc);
            await _repository.SetSuccessfulRunUtcAsync(jobName, scanStartedUtc);
            _logger.LogInformation("Job: {jobName} finished", nameof(DetectProductChangesJob));
        }


        private static bool IsNewEdition(Dictionary<string, ArchiveRow> features) {

            
            // TODO: Given ruleset, figure out if NewEdition or NewUpdate. For now just return true;
            return true;
        }
    }
}