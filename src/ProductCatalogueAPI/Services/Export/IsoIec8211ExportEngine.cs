using ProductCatalogueAPI.Data.Models;
using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Encodes S-101 directly and maps S-101 source YAML to the existing S-57 compiler pipeline.
/// </summary>
public sealed partial class IsoIec8211ExportEngine(ILogger<IsoIec8211ExportEngine> logger, string artifactsPath) : IExportEngine
{
    private const string S100CompilerPath = @"C:\Program Files\s100compiler\s100compiler.exe";
    private const string S100MapperPath = @"C:\Program Files\s100mapper\s100mapper.exe";
    private const string S57CompilerPath = @"C:\Program Files\s57compiler\s57compiler.exe";
    private readonly ILogger<IsoIec8211ExportEngine> _logger = logger;
    private readonly string _artifactsPath = artifactsPath;

    /// <inheritdoc/>
    public ExportEngineKind Kind => ExportEngineKind.IsoIec8211;

    /// <inheritdoc/>
    public bool Supports(ProductSpecification productSpecification) => productSpecification is ProductSpecification.S57 or ProductSpecification.S101;

    /// <inheritdoc/>
    public Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) => request.ProductSpecification switch {
        ProductSpecification.S101 => ExportS101Async(request, cancellationToken),
        ProductSpecification.S57 => ExportS57Async(request, cancellationToken),
        _ => throw new ArgumentOutOfRangeException(nameof(request), request.ProductSpecification, "ISO/IEC 8211 supports only S-57 and S-101.")
    };

    /// <inheritdoc/>
    public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        var directory = ExportOutputPath.GetCandidateDirectory(output.OutputRoot, output.DatasetName, output.ProductSpecification, output.Edition, output.Update);
        if (output.ProductSpecification == ProductSpecification.S101 && output.Update > 0) {
            var updatePath = Path.Combine(ExportOutputPath.GetS101DatasetFilesDirectory(output.OutputRoot, output.DatasetName, output.Edition, output.Update), $"{output.DatasetName}.{output.Update:000}");
            if (File.Exists(updatePath))
                File.Delete(updatePath);
            return Task.CompletedTask;
        }

        if (Directory.Exists(directory))
            Directory.Delete(directory, recursive: true);
        return Task.CompletedTask;
    }

    private async Task<ExportEngineResult> ExportS101Async(ExportEngineRequest request, CancellationToken cancellationToken) {
        ValidateRequest(request);
        var outputDirectory = ExportOutputPath.GetCandidateDirectory(request.OutputRoot, request.DatasetName, request.ProductSpecification, request.Edition, request.Update);
        PrepareOutputDirectory(request, outputDirectory);

        var featureCatalogue = Path.Combine(_artifactsPath, "101_FC_2.0.0.xml");
        if (!File.Exists(featureCatalogue))
            throw new FileNotFoundException("The S-101 feature catalogue was not found.", featureCatalogue);

        var inputPath = Path.Combine(outputDirectory, $"temp_{request.DatasetName}.yaml");
        var previousIndexPath = Path.Combine(outputDirectory, "prev.idx");
        var compilerIndexPath = Path.Combine(outputDirectory, $"{GetCompilerDatasetName(request.DatasetName)}_{request.Update:000}.idx");
        await File.WriteAllTextAsync(inputPath, request.DatasetYaml, Encoding.UTF8, cancellationToken);

        var arguments = $"-f \"{inputPath}\" -c \"{featureCatalogue}\" -d \"{outputDirectory}\" -C \"{request.DatasetName}\" -l \"{compilerIndexPath}\"";
        if (!string.IsNullOrWhiteSpace(request.PreviousIndex)) {
            await File.WriteAllTextAsync(previousIndexPath, request.PreviousIndex, Encoding.UTF8, cancellationToken);
            arguments += $" -L \"{previousIndexPath}\"";
        }

        await RunProcessAsync(S100CompilerPath, arguments, outputDirectory, request.DatasetName, cancellationToken);

        var datasetPath = Path.Combine(ExportOutputPath.GetS101DatasetFilesDirectory(request.OutputRoot, request.DatasetName, request.Edition, request.Update), $"{request.DatasetName}.{request.Update:000}");
        var datasetFile = new FileInfo(datasetPath);
        if (!datasetFile.Exists || datasetFile.Length == 0)
            throw new InvalidOperationException($"The S-101 compiler did not create a non-empty dataset for '{request.DatasetName}'.");

        var index = await File.ReadAllBytesAsync(compilerIndexPath, cancellationToken);
        var signaturePath = Path.Combine(outputDirectory, "S100_ROOT", "CATALOG.SIGN");
        var signature = await File.ReadAllBytesAsync(signaturePath, cancellationToken);
        var exchangeSet = await CreateZipAsync(outputDirectory, cancellationToken);
        File.Delete(compilerIndexPath);
        if (File.Exists(previousIndexPath))
            File.Delete(previousIndexPath);

        return new ExportEngineResult(outputDirectory, [
            new ExportEngineArtifact(ProductArtifactKind.CompilerIndex, Path.GetFileName(compilerIndexPath), "text/plain", index),
            new ExportEngineArtifact(ProductArtifactKind.CatalogueSignature, Path.GetFileName(signaturePath), "application/octet-stream", signature),
            new ExportEngineArtifact(ProductArtifactKind.ExchangeSet, $"{request.DatasetName}-{request.Edition}-{request.Update:000}.zip", "application/zip", exchangeSet)
        ]);
    }

    private async Task<ExportEngineResult> ExportS57Async(ExportEngineRequest request, CancellationToken cancellationToken) {
        ValidateRequest(request);
        var outputDirectory = ExportOutputPath.GetCandidateDirectory(request.OutputRoot, request.DatasetName, request.ProductSpecification, request.Edition, request.Update);
        PrepareOutputDirectory(request, outputDirectory);

        var featureCatalogue = Path.Combine(_artifactsPath, "101_FC_2.0.0.xml");
        var pipeline = Path.Combine(_artifactsPath, "pipeline-S101-S57.yaml");
        if (!File.Exists(featureCatalogue) || !File.Exists(pipeline))
            throw new FileNotFoundException("The S-57 mapping pipeline artifacts were not found.");

        var s101Yaml = Path.Combine(outputDirectory, $"{request.DatasetName}.yaml");
        var s57DatasetName = S101DatasetPrefix().Replace(request.DatasetName, request.DatasetName.Substring(3, 2));
        var s57Yaml = Path.Combine(outputDirectory, $"{s57DatasetName}.yaml");
        await File.WriteAllTextAsync(s101Yaml, request.DatasetYaml, Encoding.UTF8, cancellationToken);

        var mapperArguments = $"\"{s101Yaml}\" \"{s57Yaml}\" --fc \"{Path.GetFullPath(featureCatalogue)}\" --pipeline \"{pipeline}\"";
        await RunProcessAsync(S100MapperPath, mapperArguments, outputDirectory, request.DatasetName, cancellationToken);

        // This preserves the command contract of the existing S-57 compiler integration.
        await RunProcessAsync(S57CompilerPath, $"\"{true}\" s57", outputDirectory, request.DatasetName, cancellationToken);
        var exchangeSet = await CreateZipAsync(outputDirectory, cancellationToken);
        return new ExportEngineResult(outputDirectory, [
            new ExportEngineArtifact(ProductArtifactKind.ExchangeSet, $"{s57DatasetName}-{request.Edition}-{request.Update:000}.zip", "application/zip", exchangeSet)
        ]);
    }

    private async Task RunProcessAsync(string executable, string arguments, string workingDirectory, string datasetName, CancellationToken cancellationToken) {
        if (!File.Exists(executable))
            throw new FileNotFoundException("The configured export compiler was not found.", executable);

        _logger.LogInformation("Starting export compiler {CompilerName} for {DatasetName}.", Path.GetFileName(executable), datasetName);
        using var process = new Process {
            StartInfo = new ProcessStartInfo {
                FileName = executable,
                Arguments = arguments,
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        process.Start();
        var standardOutput = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var standardError = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var error = await standardError;
        _ = await standardOutput;

        if (process.ExitCode != 0) {
            _logger.LogError("Export compiler {CompilerName} failed for {DatasetName} with exit code {ExitCode}. Error: {CompilerError}", Path.GetFileName(executable), datasetName, process.ExitCode, error);
            throw new InvalidOperationException($"The export compiler failed for '{datasetName}' with exit code {process.ExitCode}.");
        }
    }

    private static async Task<byte[]> CreateZipAsync(string directory, CancellationToken cancellationToken) {
        await using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true)) {
            foreach (var file in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories)) {
                cancellationToken.ThrowIfCancellationRequested();
                var entry = archive.CreateEntry(Path.GetRelativePath(directory, file), CompressionLevel.Optimal);
                await using var entryStream = entry.Open();
                await using var fileStream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
                await fileStream.CopyToAsync(entryStream, cancellationToken);
            }
        }
        return stream.ToArray();
    }

    private static void PrepareOutputDirectory(ExportEngineRequest request, string outputDirectory) {
        // A new S-101 edition and every isolated non-S-101 candidate must not reuse stale compiler output.
        if (Directory.Exists(outputDirectory) && (request.ProductSpecification != ProductSpecification.S101 || request.Update == 0))
            Directory.Delete(outputDirectory, recursive: true);
        Directory.CreateDirectory(outputDirectory);

        // Updates share their edition exchange set, so only the retried target dataset file is cleared.
        if (request.ProductSpecification == ProductSpecification.S101 && request.Update > 0) {
            var updatePath = Path.Combine(ExportOutputPath.GetS101DatasetFilesDirectory(request.OutputRoot, request.DatasetName, request.Edition, request.Update), $"{request.DatasetName}.{request.Update:000}");
            if (File.Exists(updatePath))
                File.Delete(updatePath);
        }
    }

    private static string GetCompilerDatasetName(string datasetName) => datasetName.StartsWith("101DK00", StringComparison.Ordinal) ? datasetName[7..] : datasetName;

    private static void ValidateRequest(ExportEngineRequest request) {
        if (string.IsNullOrWhiteSpace(request.DatasetName))
            throw new ArgumentException("A dataset name is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.DatasetYaml))
            throw new ArgumentException("Dataset YAML is required.", nameof(request));
        if (request.Edition < 0 || request.Update < 0)
            throw new ArgumentOutOfRangeException(nameof(request), "Edition and update numbers cannot be negative.");
    }

    [GeneratedRegex(@"^101[A-Z]{2}\d{2}")]
    private static partial Regex S101DatasetPrefix();
}
