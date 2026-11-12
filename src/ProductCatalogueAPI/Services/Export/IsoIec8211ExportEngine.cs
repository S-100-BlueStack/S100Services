using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.ValidationEmail;
using System.Diagnostics;
using System.IO.Compression;
using System.Text;

namespace ProductCatalogueAPI.Services.Export;

/// <summary>
/// Encodes S-101 directly and maps S-101 source YAML to the existing S-57 compiler pipeline.
/// </summary>
/// <param name="logger">Receives compiler diagnostics without exposing internal paths to API callers.</param>
/// <param name="artifactsPath">Contains the feature catalogue and S-57 mapping pipeline.</param>
/// <param name="s100CompilerExecutablePath">The configured S-101 compiler executable.</param>
/// <param name="s100MapperExecutablePath">The configured S-101 to S-57 mapper executable.</param>
/// <param name="s57CompilerExecutablePath">The configured S-57 compiler executable.</param>
public class IsoIec8211ExportEngine(ILogger<IsoIec8211ExportEngine> logger, string artifactsPath, string s100CompilerExecutablePath = S100CompilerConfiguration.CompatibilityDefaultExecutablePath, string s100MapperExecutablePath = ExportToolConfiguration.DefaultMapperExecutablePath, string s57CompilerExecutablePath = ExportToolConfiguration.DefaultS57ExecutablePath) : IExportEngine
{
    private readonly string _s100MapperExecutablePath = s100MapperExecutablePath;
    private readonly string _s57CompilerExecutablePath = s57CompilerExecutablePath;
    private readonly ILogger<IsoIec8211ExportEngine> _logger = logger;
    private readonly string _artifactsPath = artifactsPath;
    private readonly string _s100CompilerExecutablePath = s100CompilerExecutablePath;

    /// <summary>Checks the configured S-101 executable without creating output or starting a process.</summary>
    /// <exception cref="S100CompilerPrerequisiteException">The configured path is blank, invalid, missing, or not an executable path.</exception>
    public void EnsureS100CompilerAvailable() => _ = GetValidatedS100CompilerExecutablePath();

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
        cancellationToken.ThrowIfCancellationRequested();
        ValidateRequest(request);
        // Validate before clearing candidate output so a configuration failure preserves existing files.
        var compilerExecutablePath = GetValidatedS100CompilerExecutablePath();
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

        await RunProcessAsync(compilerExecutablePath, arguments, outputDirectory, request.DatasetName, cancellationToken, isS100Compiler: true);

        return await ReadS101ExportResultAsync(request, compilerIndexPath, previousIndexPath, cancellationToken);
    }

    /// <summary>Reads the S-101 exchange set from the compiler's dataset-specific output layout.</summary>
    /// <remarks>Separated from process execution so output validation and archiving can be regression-tested without a compiler.</remarks>
    internal static async Task<ExportEngineResult> ReadS101ExportResultAsync(ExportEngineRequest request, string compilerIndexPath, string previousIndexPath, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        var outputDirectory = ExportOutputPath.GetCandidateDirectory(request.OutputRoot, request.DatasetName, request.ProductSpecification, request.Edition, request.Update);
        var datasetFilesDirectory = ExportOutputPath.GetS101DatasetFilesDirectory(request.OutputRoot, request.DatasetName, request.Edition, request.Update);
        var datasetPath = Path.Combine(datasetFilesDirectory, $"{request.DatasetName}.{request.Update:000}");
        var datasetFile = new FileInfo(datasetPath);
        if (!datasetFile.Exists || datasetFile.Length == 0)
            throw new InvalidOperationException($"The S-101 compiler did not create a non-empty dataset for '{request.DatasetName}'.");
        // An update must not archive only its .NNN while the existing edition's
        // .000 remains in an older compiler layout outside this exchange set.
        if (request.Update > 0) {
            var baseDataset = new FileInfo(Path.Combine(datasetFilesDirectory, $"{request.DatasetName}.000"));
            if (!baseDataset.Exists || baseDataset.Length == 0)
                throw new InvalidOperationException($"The S-101 exchange set is missing a non-empty base dataset for '{request.DatasetName}'.");
        }

        var s100Root = ExportOutputPath.GetS101ExchangeSetDirectory(request.OutputRoot, request.DatasetName, request.Edition, request.Update);
        var signaturePath = Path.Combine(s100Root, "CATALOG.SIGN");
        var index = await File.ReadAllBytesAsync(compilerIndexPath, cancellationToken);
        var signature = await File.ReadAllBytesAsync(signaturePath, cancellationToken);
        // Only S100_ROOT belongs in the exchange set; staging YAML and compiler indexes are separate artifacts.
        var exchangeSet = await CreateZipAsync(s100Root, cancellationToken, "S100_ROOT");
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
        var outputDirectory = Path.GetFullPath(ExportOutputPath.GetCandidateDirectory(request.OutputRoot, request.DatasetName, request.ProductSpecification, request.Edition, request.Update));
        PrepareOutputDirectory(request, outputDirectory);

        var featureCatalogue = Path.Combine(_artifactsPath, "101_FC_2.0.0.xml");
        var pipeline = Path.GetFullPath(Path.Combine(_artifactsPath, "pipeline-S101-S57.yaml"));
        if (!File.Exists(featureCatalogue) || !File.Exists(pipeline))
            throw new FileNotFoundException("The S-57 mapping pipeline artifacts were not found.");

        if (string.IsNullOrWhiteSpace(request.SourceDatasetName))
            throw new ArgumentException("An S-101 source dataset name resolved through ProductMapping is required for an S-57 export.", nameof(request));

        var s101Yaml = Path.Combine(outputDirectory, $"{request.SourceDatasetName}.yaml");
        var s57Yaml = Path.Combine(outputDirectory, $"{request.DatasetName}.yaml");
        await File.WriteAllTextAsync(s101Yaml, request.DatasetYaml, Encoding.UTF8, cancellationToken);

        var mapperArguments = $"\"{s101Yaml}\" \"{s57Yaml}\" --fc \"{Path.GetFullPath(featureCatalogue)}\" --pipeline \"{pipeline}\"";
        // The pipeline includes relative rule files, so the mapper must start beside it.
        await RunProcessAsync(_s100MapperExecutablePath, mapperArguments, Path.GetDirectoryName(pipeline)!, request.DatasetName, cancellationToken);
        if (!File.Exists(s57Yaml) || new FileInfo(s57Yaml).Length == 0)
            throw new InvalidOperationException($"The S-57 mapper did not create a non-empty YAML file for '{request.DatasetName}'.");

        // The compiler takes the mapped S-57 YAML path and the output directory.
        await RunProcessAsync(_s57CompilerExecutablePath, $"\"{s57Yaml}\" \"{outputDirectory}\"", outputDirectory, request.DatasetName, cancellationToken);
        return await ReadS57ExportResultAsync(request, cancellationToken);
    }

    /// <summary>Archives flat or nested S-57 compiler output beneath one transport-compatible ENC_ROOT.</summary>
    /// <param name="request">Exact candidate identity and compiler output location.</param>
    /// <param name="cancellationToken">Stops archive creation before any artifact is returned.</param>
    /// <returns>The original output directory and a validated exchange-set artifact, excluding mapper input YAML.</returns>
    /// <exception cref="ArgumentException">The request is not an S-57 candidate or its export identity is invalid.</exception>
    /// <exception cref="InvalidOperationException">The compiler did not produce the unique non-empty base cell or requested update.</exception>
    /// <exception cref="InvalidDataException">The archive contains ambiguous, mismatched or unsafe dataset members.</exception>
    /// <remarks>Only ZIP paths change. Dataset and catalogue bytes, and paths relative to an existing ENC_ROOT, remain intact.</remarks>
    internal static async Task<ExportEngineResult> ReadS57ExportResultAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) {
        cancellationToken.ThrowIfCancellationRequested();
        ValidateRequest(request);
        if (request.ProductSpecification != ProductSpecification.S57)
            throw new ArgumentException("An S-57 candidate is required.", nameof(request));
        var outputDirectory = Path.GetFullPath(ExportOutputPath.GetCandidateDirectory(request.OutputRoot, request.DatasetName, request.ProductSpecification, request.Edition, request.Update));
        var datasetDirectory = Path.GetFullPath(ExportOutputPath.GetS57DatasetFilesDirectory(request.OutputRoot, request.DatasetName, request.Edition, request.Update));
        var datasetFile = new FileInfo(Path.Combine(datasetDirectory, $"{request.DatasetName}.{request.Update:000}"));
        if (!datasetFile.Exists || datasetFile.Length == 0)
            throw new InvalidOperationException($"The S-57 compiler did not create a non-empty outgoing dataset for '{request.DatasetName}'.");

        // SevenCs accepts flat and nested output. Preserve an existing exchange-set
        // root; otherwise wrap the compiler output rather than losing auxiliary files.
        var exchangeSetDirectory = outputDirectory;
        for (DirectoryInfo? directory = new(datasetDirectory); directory is not null && !string.Equals(directory.FullName, outputDirectory, StringComparison.OrdinalIgnoreCase); directory = directory.Parent) {
            if (directory.Name.Equals("ENC_ROOT", StringComparison.OrdinalIgnoreCase)) {
                exchangeSetDirectory = directory.FullName;
                break;
            }
        }
        var stagingFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            Path.Combine(outputDirectory, $"{request.DatasetName}.yaml")
        };
        if (!string.IsNullOrWhiteSpace(request.SourceDatasetName))
            stagingFiles.Add(Path.Combine(outputDirectory, $"{request.SourceDatasetName}.yaml"));
        var exchangeSet = await CreateZipAsync(exchangeSetDirectory, cancellationToken, "ENC_ROOT", stagingFiles);
        // Ready must mean the stored ZIP can pass the same strict preflight as Send.
        _ = ValidationOutgoingManifest.Read(exchangeSet, "S57", request.DatasetName, request.Update);
        return new ExportEngineResult(outputDirectory, [
            new ExportEngineArtifact(ProductArtifactKind.ExchangeSet, $"{request.DatasetName}-{request.Edition}-{request.Update:000}.zip", "application/zip", exchangeSet)
        ]);
    }

    /// <summary>Validates the compiler path and returns an absolute path while keeping technical errors in server logs.</summary>
    private string GetValidatedS100CompilerExecutablePath() {
        if (string.IsNullOrWhiteSpace(_s100CompilerExecutablePath)) {
            _logger.LogError("S100 compiler prerequisite failed because {ConfigurationKey} is blank.", S100CompilerConfiguration.ExecutablePathKey);
            throw new S100CompilerPrerequisiteException();
        }

        string fullPath;
        try {
            fullPath = Path.GetFullPath(_s100CompilerExecutablePath.Trim());
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException) {
            _logger.LogError(ex, "S100 compiler prerequisite failed because {ConfigurationKey} is not a valid path.", S100CompilerConfiguration.ExecutablePathKey);
            throw new S100CompilerPrerequisiteException();
        }

        if (!string.Equals(Path.GetExtension(fullPath), ".exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath)) {
            _logger.LogError("S100 compiler prerequisite failed because the configured executable is unavailable. ExecutablePath: {ExecutablePath}", fullPath);
            throw new S100CompilerPrerequisiteException();
        }

        return fullPath;
    }

    /// <summary>Starts the external compiler. Tests override this boundary without launching installed tools.</summary>
    /// <param name="startInfo">The configured compiler command and redirected streams.</param>
    /// <returns>The running compiler process.</returns>
    protected virtual Process StartCompilerProcess(ProcessStartInfo startInfo) => Process.Start(startInfo)
        ?? throw new InvalidOperationException("The configured compiler process did not start.");

    /// <summary>Preserves the safe S-101 prerequisite failure contract when process creation fails.</summary>
    private Process StartCompilerProcessSafely(ProcessStartInfo startInfo, string datasetName, bool isS100Compiler) {
        try {
            return StartCompilerProcess(startInfo);
        }
        catch (Exception ex) when (isS100Compiler) {
            _logger.LogError(ex, "Configured S100 compiler could not be started for {DatasetName}.", datasetName);
            throw new S100CompilerPrerequisiteException();
        }
    }

    private async Task RunProcessAsync(string executable, string arguments, string workingDirectory, string datasetName, CancellationToken cancellationToken, bool isS100Compiler = false) {
        cancellationToken.ThrowIfCancellationRequested();
        if (!File.Exists(executable)) {
            if (isS100Compiler)
                throw new S100CompilerPrerequisiteException();
            throw new FileNotFoundException("The configured export compiler was not found.", executable);
        }

        ExportToolDiagnostics.LogBeforeLaunch(_logger, executable, datasetName);
        var startInfo = new ProcessStartInfo {
            FileName = executable,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = false,
            RedirectStandardError = true
        };

        using var process = StartCompilerProcessSafely(startInfo, datasetName, isS100Compiler);
        var standardError = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var error = await standardError;

        if (process.ExitCode != 0) {
            _logger.LogError("Export compiler {CompilerName} failed for {DatasetName} with exit code {ExitCode}. Stderr: {CompilerError}.", Path.GetFileName(executable), datasetName, process.ExitCode, error);
            throw new InvalidOperationException($"The export compiler failed for '{datasetName}' with exit code {process.ExitCode}.");
        }
    }

    /// <summary>Archives compiler output with portable paths and an optional canonical exchange-set root.</summary>
    /// <param name="directory">Directory whose relative layout is preserved.</param>
    /// <param name="cancellationToken">Cancels copying compiler output.</param>
    /// <param name="entryPrefix">Optional top-level exchange-set directory.</param>
    /// <param name="excludedFiles">Absolute staging-input paths that must not enter the delivery artifact.</param>
    /// <returns>ZIP bytes without changing any archived file content.</returns>
    private static async Task<byte[]> CreateZipAsync(string directory, CancellationToken cancellationToken, string? entryPrefix = null, IReadOnlySet<string>? excludedFiles = null) {
        await using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true)) {
            foreach (var file in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories)) {
                cancellationToken.ThrowIfCancellationRequested();
                if (excludedFiles?.Contains(Path.GetFullPath(file)) == true)
                    continue;
                var relativePath = Path.GetRelativePath(directory, file).Replace(Path.DirectorySeparatorChar, '/').Replace('\\', '/');
                var entryName = entryPrefix is null ? relativePath : $"{entryPrefix}/{relativePath.Replace(Path.DirectorySeparatorChar, '/')}";
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
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

}
