using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
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
            this._logger.LogInformation("{newEdition} called with name: {name}", nameof(NewEdition), name);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            if (this._electronicProductManager.ElectronicProduct(name) == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return this.StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dataset = await this._electronicProductManager.CreateNewEditionAsync(name);

            var yaml = dataset.Serialize();


            if (string.IsNullOrEmpty(yaml)) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return this.StatusCode(StatusCodes.Status500InternalServerError, response);
            }

            var product = this._electronicProductManager.ElectronicProduct(name)!;

            this._logger.LogInformation("Creating exchange set for product {name} edition {edition}", name, product.editionNumber);

            this.CreateExchangeSet(product, yaml);

            response.DurationMs = sw.ElapsedMilliseconds;
            return this.Ok(response);
        }


        ///// <summary>
        ///// Creates a new update.
        ///// </summary>
        ///// <param name="name">The name of the dataset.</param>
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        //[HttpPost("{name}/newupdate", Name = "NewUpdate")]
        //public async Task<IActionResult> NewUpdate(string name = "101DK0040349E") {
        //    return StatusCode(StatusCodes.Status501NotImplemented);

        //    var sw = Stopwatch.StartNew();
        //    var response = new ApiResponse();


        //    var product = _electronicProductManager.ElectronicProduct(name);


        //    if (product == null) {
        //        response.Success = false;
        //        response.Message = $"No electronic product with name '{name}' was found.";
        //        response.DurationMs = sw.ElapsedMilliseconds;
        //        return StatusCode(StatusCodes.Status404NotFound, response);
        //    }


        //    var dirtyYaml = await _electronicProductManager.IsDirtyYamlAsync(name);

        //    if(!dirtyYaml) {
        //        response.Success = false;
        //        response.Message = $"Product has no updates.";
        //        response.DurationMs = sw.ElapsedMilliseconds;
        //        return BadRequest(response);

        //    }

        //    //// Check if product has any updates before creating new update
        //    //var dirty = await _electronicProductManager.IsDirtyAsync(name);

        //    //if (!dirty) {
        //    //    response.Success = false;
        //    //    response.Message = $"Product has no updates.";
        //    //    response.DurationMs = sw.ElapsedMilliseconds;
        //    //    return BadRequest(response);
        //    //}

        //    // todo: detect updates properly
        //    var dataset = await _electronicProductManager.CreateNewUpdateAsync(name);

        //    var incoming = dataset.Serialize();

        //    if (string.IsNullOrEmpty(incoming)) {
        //        response.Success = false;
        //        response.Message = $"An error occured attempting to read dataset '{name}'.";
        //        response.DurationMs = sw.ElapsedMilliseconds;
        //        return StatusCode(StatusCodes.Status500InternalServerError, response);
        //    }

        //    var latest = await _electronicProductManager.GetLatestDatasetYAML(name, product.editionNumber!.Value);



        //    // Build YAML Delta
        //    var delta = S100FC.YAML.DatasetComparer.Compare(latest, incoming);

        //    //if(!delta.HasEdits)
        //    // TODO: Do something

        //    // Populate metadata
        //    delta.CellName = product.datasetName;
        //    delta.Comment = "Not for navigation!";
        //    delta.Edition = product.editionNumber!.Value;
        //    //delta.Update = product.updateNumber!.Value;       // Hide for now until bugfix in s100compiler
        //    delta.ENCVer = $"INT.IHO.{product.productSpecification?.name}.{product.productSpecification?.version}";         // delta.ENCVer = "INT.IHO.S-101.2.0.0";
        //    delta.FCVer = product.productSpecification?.version;        // delta.FCVer = "2.0.0";

        //    var update = S100FC.YAML.Converter.Serialize(delta);     // Only delta

        //    this.CreateExchangeSet(product, update);

        //    response.DurationMs = sw.ElapsedMilliseconds;
        //    return Ok(response);
        //}

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

            if (_electronicProductManager.ElectronicProduct(name) == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            // Create exchange set?
            var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);
            var yaml = dataset.Serialize();

            var product = _electronicProductManager.ElectronicProduct(name)!;

            this.CreateExchangeSet(product, yaml);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }


        private void CreateExchangeSet(ElectronicProduct product, string yaml) {
            var datasetName = product.datasetName;

            var dir = IO.Directory.CreateDirectory(this._electronicProductManager.OutputFolder);

            var exchangeset = IO.Directory.CreateDirectory(Path.Combine(dir.FullName, datasetName, $"{product.editionNumber}"));

            // Write temp YAML file for the compiler
            IO.File.WriteAllText(Path.Combine(exchangeset.FullName, $"temp_{datasetName}.yaml"), yaml);

            var catalogue = Path.Combine(AppContext.BaseDirectory, "101_Feature_Catalogue_2.0.0.xml");

            if (!IO.File.Exists(catalogue))
                throw new NullReferenceException("Could not find featurecatalogue!");

            var commandline = $"-f \"{IO.Path.Combine(exchangeset.FullName, $"temp_{datasetName}.yaml")}\" -c \"{catalogue}\" -d \"{exchangeset.FullName}\"  -C {datasetName}";


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
                Log.Error("\"{filename}\" {arguments}", p.StartInfo.FileName, commandline);
                throw new ArgumentException(commandline);
            }

            // Cleanup temp yaml
            //IO.File.Delete(Path.Combine(exchangeset.FullName, $"temp_{datasetName}.yaml"));
        }
    }
}