using System.Diagnostics;
using IO = System.IO;

namespace ProductCatalogueService.Services.ExchangeSet
{
    public class ExchangeSetService(ILogger<ExchangeSetService> logger) : IExchangeSetService
    {
        private readonly ILogger<ExchangeSetService> _logger = logger;
        public ExchangeSetResult CreateExchangeSet(S100FC.S128.FeatureTypes.ElectronicProduct product, string outputFolder, string yaml, string prevIndex = "") {
            var datasetName = product!.datasetName!;

            var dir = IO.Directory.CreateDirectory(outputFolder);

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

            return new(index, sign);
        }

        public void DeleteExchangeSet(string datasetName, int editionNumber, string outputFolder) {
            IO.Directory.Delete(Path.Combine(outputFolder, datasetName, $"{editionNumber}"), true);
        }
    }
}
