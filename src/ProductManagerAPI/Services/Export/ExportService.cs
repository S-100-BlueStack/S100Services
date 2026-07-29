using System.Diagnostics;
using System.Text.RegularExpressions;
using IO = System.IO;

namespace ProductManagerAPI.Services.Export
{
    public partial class ExportService(ILogger<ExportService> logger, string artifactsPath) : IExportService
    {
        private readonly ILogger<ExportService> _logger = logger;
        private readonly string _artifactsPath = artifactsPath;
        const string fileReferencePattern = @"^101[A-Z]{2}\d{2}";
        private static readonly Regex fileReferenceRegex = new Regex(fileReferencePattern);

        public ExportResult CreateS100Export(string datasetName, uint editionNo, uint? updateNo, string outputFolder, string yaml, string prevIndex = "") {
            var dir = IO.Directory.CreateDirectory(outputFolder);

            var Export = IO.Directory.CreateDirectory(Path.Combine(dir.FullName, datasetName, $"{editionNo}"));

            var update = (updateNo ?? 0).ToString("D3");



            // yaml = SetMinimumDisplayScale().Replace(yaml, "$1\r\n        Value: 19999999");
           // yaml = Regex.Replace(yaml, @"(?m)^(\s*)-\s*Name:\s*minimumDisplayScale\s*$", "$0\r\n$1  Value: 19999999");

            // Write temp YAML file for the compiler
            IO.File.WriteAllText(Path.Combine(Export.FullName, $"temp_{datasetName}.yaml"), yaml);

            //var catalogue = Path.Combine(AppContext.BaseDirectory, "101_Feature_Catalogue_2.0.0.xml");
            var catalogue = Path.Combine(_artifactsPath, "101_FC_2.0.0.xml");

            if (!IO.File.Exists(catalogue))
                throw new NullReferenceException("Could not find featurecatalogue!");

            var input = IO.Path.Combine(Export.FullName, $"temp_{datasetName}.yaml");
            var output = Export.FullName;
            var prevIndexPath = Path.Combine(Export.FullName, "prev.idx");

            var indexFile = Path.Combine(Export.FullName, $"{datasetName.Replace("101DK00", "")}_{update}.idx");

            var commandline = $"-f \"{input}\" -c \"{catalogue}\" -d \"{output}\" -C \"{datasetName}\" -l \"{indexFile}\"";

            if (!string.IsNullOrEmpty(prevIndex)) {
                IO.File.WriteAllText(prevIndexPath, prevIndex);
                commandline += $" -L {prevIndexPath}";
            }

            _logger.LogInformation("Starting S100 compiler for product: {product} with commandline: {commandline}", datasetName, commandline);

            var startInfo = new ProcessStartInfo {
                FileName = @"C:\Program Files\s100compiler\s100compiler.exe",
                Arguments = commandline,
                WorkingDirectory = Export.FullName,
                UseShellExecute = false,
                CreateNoWindow = false, //true,
                RedirectStandardOutput = false, //true,
                RedirectStandardError = true
            };

            using var process = new Process {
                StartInfo = startInfo
            };

            process.Start();

            var errorTask = process.StandardError.ReadToEndAsync();

            process.WaitForExit();
            
            if (process.ExitCode != 0) {
                var error = errorTask.GetAwaiter().GetResult();

                if (!string.IsNullOrWhiteSpace(error)) {
                    _logger.LogError("S100 compiler error output for product {Product}:{NewLine}{Error}", datasetName, Environment.NewLine, error);
                }

                throw new InvalidOperationException($"S100 compiler failed for product '{datasetName}' with exit code {process.ExitCode}.{Environment.NewLine}{error}");
            }

            // Check if .000 is 0 bytes
            var file = new FileInfo(Path.Combine(output, "S100_ROOT", "S-101", "DATASET_FILES", $"{datasetName}.{update}"));
            if (file.Length == 0)
                throw new InvalidOperationException($"S100 compiler created an empty .000 file");



            _logger.LogInformation("S100 compiler run succesfully! Starting cleanup for temp index and yaml files for product: {product}", datasetName);
            var index = IO.File.ReadAllText(indexFile);
            var sign = IO.File.ReadAllText(Path.Combine(Export.FullName, "S100_ROOT", "CATALOG.SIGN"));


            // Cleanup temp yaml
            //IO.File.Delete(input);

            // Cleanup temp index
            IO.File.Delete(indexFile);
            IO.File.Delete(prevIndexPath);



            return new(index, sign);
        }


        public int CreateS57Export(string datasetName, uint editionNo, uint? updateNo, string output, string yaml) {
            var featureCataloguePath = Path.Combine(_artifactsPath, "101_FC_2.0.0.xml");

            if (!IO.File.Exists(featureCataloguePath))
                throw new NullReferenceException("Could not find featurecatalogue!");

            var update = (updateNo ?? 0).ToString("D3");

            if (IO.File.Exists(@"c:\Program Files\s57compiler\s57compiler.exe")) {
                if (IO.File.Exists(@"c:\Program Files\s100mapper\s100mapper.exe")) {
                    var filename_s101 = IO.Path.Combine(output, $"{datasetName}.yaml");
                    var filename_s57 = fileReferenceRegex.Replace(datasetName, datasetName.Substring(3, 2));
                    filename_s57 = IO.Path.Combine(output, $"{filename_s57}.yaml");

                    var pipeline = IO.Path.Combine(IO.Path.GetDirectoryName(featureCataloguePath!)!, "pipeline-S101-S57.yaml");
                    var s100mapper = $"\"{filename_s101}\" \"{filename_s57}\" --fc \"{IO.Path.GetFullPath(featureCataloguePath!)}\" --pipeline \"{pipeline}\"";

                    _logger.LogInformation("s100mapper.exe {s101}.yaml {filename_s57}.yaml --fc {fc} --pipeline pipeline-S101-S57.yaml", datasetName, IO.Path.GetFileNameWithoutExtension(filename_s57), IO.Path.GetFileName(featureCataloguePath));

                    var p = new Process();
                    p.StartInfo.CreateNoWindow = true;
                    p.StartInfo.UseShellExecute = false;
                    p.StartInfo.WindowStyle = ProcessWindowStyle.Hidden;
                    p.StartInfo.FileName = @"C:\Program Files\s100mapper\s100mapper.exe";
                    p.StartInfo.Arguments = s100mapper;
                    p.StartInfo.WorkingDirectory = IO.Path.GetDirectoryName(pipeline);
                    p.StartInfo.RedirectStandardOutput = false;
                    p.StartInfo.RedirectStandardError = true;
                    p.EnableRaisingEvents = true;
                    p.Exited += (s, e) => {
                        ;
                    };

                    p.Start();
                    p.WaitForExit();

                    if (p.ExitCode != 0) {
                        var error = p.StandardError.ReadToEnd();

                        _logger.LogError("\"{filename}\" {arguments}", IO.Path.GetFileName(p.StartInfo.FileName), s100mapper);
                        return p.ExitCode;
                    }

                    var s57Compiler = $"\"{true}\" s57";
                    p.StartInfo.FileName = @"C:\Program Files\s57Compiler\s57Compiler.exe";
                    p.StartInfo.Arguments = s57Compiler;
                    p.StartInfo.WorkingDirectory = IO.Path.GetDirectoryName(output);

                    p.Start();
                    p.WaitForExit();

                    if (p.ExitCode != 0) {
                        //var console = p.StandardOutput.ReadToEnd();
                        var error = p.StandardError.ReadToEnd();

                        _logger.LogError("\"{filename}\" {arguments}", IO.Path.GetFileName(p.StartInfo.FileName), s100mapper);
                        return p.ExitCode;
                    }
                }
            }
            throw new NotImplementedException();
        }

        public bool DeleteExport(string datasetName, string outputFolder, uint editionNo, uint? updateNo = 0) {
            try {
                var editionFolder = Path.Combine(outputFolder, datasetName, editionNo.ToString());

                // If no update number is provided, delete the entire edition folder. Otherwise, just delete the specific update file.
                if (!updateNo.HasValue || updateNo == 0) {
                    Directory.Delete(editionFolder, recursive: true);
                    return true;
                }

                var updateFileName = $"{datasetName}.{updateNo:000}";
                var updateFilePath = Path.Combine(
                    editionFolder,
                    "S100_ROOT",
                    "S-101",
                    "DATASET_FILES",
                    updateFileName);

                if (File.Exists(updateFilePath)) {
                    File.Delete(updateFilePath);
                }

                return true;
            }
            catch (Exception ex) {
                _logger.LogError(ex, "Error deleting export for dataset: {datasetName}, edition: {editionNo}, update: {updateNo}", datasetName, editionNo, updateNo);
                return false;
            }
        }

        [GeneratedRegex(@"(?ms)(^\s*-\s*Name:\s*minimumDisplayScale\s*$)(?!\s*\r?\n\s*Value:)")]
        private static partial Regex SetMinimumDisplayScale();
    }
}