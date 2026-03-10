using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using Serilog;
using System.Diagnostics;
using static ProductCatalogueService.ResponseTypes;
using IO = System.IO;

namespace ProductCatalogueService.Controllers
{
    public class ExportController(ILogger<ExportController> logger, IMemoryCache cache, IProductManager productManager) : ControllerBase
    {
        private readonly ILogger<ExportController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IMemoryCache _cache = cache;


        /// <summary>
        /// Creates a new edition.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newedition", Name = "NewEdition")]
        public async Task<IActionResult> NewEdition(string name) {
            _logger.LogInformation("{newEdition} called with name: {name}", nameof(NewEdition), name);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dataset = await _electronicProductManager.CreateNewEditionAsync(name);

            var yaml = dataset.Serialize();


            if (string.IsNullOrEmpty(yaml)) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }



            var (index, sign) = this.CreateExchangeSet(name, yaml);

             await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewEdition, yaml, index, sign);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }


        /// <summary>
        /// Creates a new update.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newupdate", Name = "NewUpdate")]
        public async Task<IActionResult> NewUpdate(string name = "101DK0040349E") {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            // Check if product has any updates before creating new update
            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dirty = await _electronicProductManager.IsDirtyAsync(name);

            if (!dirty) {
                response.Success = false;
                response.Message = $"Product has no updates.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return BadRequest(response);
            }

            var dataset = await _electronicProductManager.CreateNewUpdateAsync(name);

            var incoming = dataset.Serialize();

            if (string.IsNullOrEmpty(incoming)) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }


            var (latest, prevIndex) = await _electronicProductManager.GetLatestDatasetYAML(name, product.editionNumber!.Value);


            // Build YAML Delta
            var delta = S100FC.YAML.DatasetComparer.Compare(latest, incoming);

            if (!delta.HasEdits) {
                _logger.LogError("No edits found for product {product} during NewUpdate.", name);
                response.Success = false;
                response.Message = $"An error occured identifying edits.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }

            var update = S100FC.YAML.Converter.Serialize(delta);

            var (index, sign) = this.CreateExchangeSet(name, update, prevIndex);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.Update, update, index, sign);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }

        /// <summary>
        /// Creates a new dataset.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newdataset", Name = "NewDataset")]
        public async Task<IActionResult> NewDataset(string name = "101DK0040349E") {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            // Create exchange set?
            var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);
            var yaml = dataset.Serialize();


            var (index, sign) = this.CreateExchangeSet(name, yaml);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, index, sign);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }

       
        private (string index, string sign) CreateExchangeSet(string dsnm, string yaml, string prevIndex = "") {
            var product = _electronicProductManager.ElectronicProduct(dsnm);

            var datasetName = product!.datasetName;

            var dir = IO.Directory.CreateDirectory(_electronicProductManager.OutputFolder);

            var exchangeset = IO.Directory.CreateDirectory(Path.Combine(dir.FullName, datasetName, $"{product.editionNumber}"));

            var update = product.updateNumber.HasValue ? product.updateNumber.Value.ToString("D3") : "000";

            // Write temp YAML file for the compiler
            IO.File.WriteAllText(Path.Combine(exchangeset.FullName, $"temp_{datasetName}.yaml"), yaml);

            var catalogue = Path.Combine(AppContext.BaseDirectory, "101_Feature_Catalogue_2.0.0.xml");

            if (!IO.File.Exists(catalogue))
                throw new NullReferenceException("Could not find featurecatalogue!");

            var input = IO.Path.Combine(exchangeset.FullName, $"temp_{datasetName}.yaml");
            var output = exchangeset.FullName;
            var prevIndexPath = Path.Combine(exchangeset.FullName, "prev.idx");

            var indexFile = Path.Combine(exchangeset.FullName, $"{datasetName.Replace("101DK00", "")}_{update}.idx");

            var commandline = $"-f \"{input}\" -c \"{catalogue}\" -d \"{output}\" -C \"{datasetName}\" -l \"{indexFile}\"";

            if (!string.IsNullOrEmpty(prevIndex)) {
                IO.File.WriteAllText(prevIndexPath, prevIndex);
                commandline += $" -L {prevIndexPath}";
            }



            //var commandline = $"-f \"{IO.Path.Combine(exchangeset.FullName, $"temp_{datasetName}.yaml")}\" -c \"{catalogue}\" -d \"{exchangeset.FullName}\"  -C {datasetName} -L {datasetName}_000.idx";


            var p = new Process();
            p.StartInfo.CreateNoWindow = true;
            p.StartInfo.UseShellExecute = true;
            p.StartInfo.WindowStyle = ProcessWindowStyle.Hidden;
            p.StartInfo.FileName = @"C:\Program Files\s100compiler\s100compiler.exe";
            p.StartInfo.Arguments = commandline;
            p.StartInfo.WorkingDirectory = exchangeset.FullName;
            p.EnableRaisingEvents = true;
            p.Exited += (s, e) => {
            };

            p.Start();
            p.WaitForExit();

            if (p.ExitCode != 0) {
                _logger.LogError("\"{filename}\" {arguments} for product: {product}", p.StartInfo.FileName, commandline, product.datasetName);
                throw new ArgumentException(commandline);
            }

            _logger.LogInformation("S100 compiler run succesfully! Starting cleanup for temp index and yaml files for product: {product}", product.datasetName);

            var index = IO.File.ReadAllText(indexFile);
            var sign = IO.File.ReadAllText(Path.Combine(exchangeset.FullName, "S100_ROOT", "CATALOG.SIGN"));


            // Cleanup temp yaml
            IO.File.Delete(input);

            // Cleanup temp index
            IO.File.Delete(indexFile);
            IO.File.Delete(prevIndexPath);

            return (index, sign);
        }
    }
}