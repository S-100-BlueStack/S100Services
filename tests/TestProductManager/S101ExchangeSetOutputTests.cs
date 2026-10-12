using System.IO.Compression;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Export;

namespace TestProductCatalogueAPI;

public sealed class S101ExchangeSetOutputTests : IDisposable
{
    private const string DatasetName = "101DK001OSTSO";
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"pc-s101-output-{Guid.NewGuid():N}");

    [Fact]
    public async Task NewEditionArtifactsUseCompilerRootWithoutStagingFiles() {
        var request = CreateRequest(edition: 1, update: 0);
        var outputDirectory = GetCandidateDirectory(request);
        var datasetDirectory = GetDatasetDirectory(request);
        Directory.CreateDirectory(datasetDirectory);

        var sourceBytes = new byte[] { 1, 2, 3 };
        await File.WriteAllBytesAsync(Path.Combine(datasetDirectory, $"{DatasetName}.000"), sourceBytes);
        await File.WriteAllTextAsync(Path.Combine(outputDirectory, "S100_ROOT", "CATALOG.SIGN"), "signature");
        await File.WriteAllTextAsync(Path.Combine(outputDirectory, "S100_ROOT", "CATALOG.XML"), "catalogue");
        var inputYaml = Path.Combine(outputDirectory, $"temp_{DatasetName}.yaml");
        await File.WriteAllTextAsync(inputYaml, "staging source YAML");
        var previousIndex = Path.Combine(outputDirectory, "prev.idx");
        await File.WriteAllTextAsync(previousIndex, "previous index");
        var compilerIndex = await WriteIndexAsync(outputDirectory, update: 0);

        var result = await IsoIec8211ExportEngine.ReadS101ExportResultAsync(request, compilerIndex, previousIndex);

        Assert.Equal(outputDirectory, result.OutputDirectory);
        Assert.Equal(3, result.Artifacts.Count);
        var indexArtifact = Assert.Single(result.Artifacts, artifact => artifact.Kind == ProductArtifactKind.CompilerIndex);
        var signatureArtifact = Assert.Single(result.Artifacts, artifact => artifact.Kind == ProductArtifactKind.CatalogueSignature);
        var exchangeSetArtifact = Assert.Single(result.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ExchangeSet);
        Assert.Equal("1OSTSO_000.idx", indexArtifact.FileName);
        Assert.Equal("compiler index", Encoding.UTF8.GetString(indexArtifact.Content));
        Assert.Equal("CATALOG.SIGN", signatureArtifact.FileName);
        Assert.Equal("signature", Encoding.UTF8.GetString(signatureArtifact.Content));
        Assert.Equal($"{DatasetName}-1-000.zip", exchangeSetArtifact.FileName);

        using var archive = new ZipArchive(new MemoryStream(exchangeSetArtifact.Content), ZipArchiveMode.Read);
        var entryNames = archive.Entries.Select(entry => entry.FullName).OrderBy(name => name, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] {
            "S100_ROOT/CATALOG.SIGN",
            "S100_ROOT/CATALOG.XML",
            $"S100_ROOT/S-101/DATASET_FILES/{DatasetName}.000"
        }, entryNames);
        var datasetEntry = archive.GetEntry($"S100_ROOT/S-101/DATASET_FILES/{DatasetName}.000");
        Assert.NotNull(datasetEntry);
        await using var datasetStream = datasetEntry!.Open();
        using var buffer = new MemoryStream();
        await datasetStream.CopyToAsync(buffer);
        Assert.Equal(sourceBytes, buffer.ToArray());

        Assert.True(File.Exists(inputYaml));
        Assert.False(File.Exists(compilerIndex));
        Assert.False(File.Exists(previousIndex));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MissingOrEmptyDatasetFailsBeforeStagingArtifactsAreDeleted(bool emptyDataset) {
        var request = CreateRequest(edition: 1, update: 0);
        var outputDirectory = GetCandidateDirectory(request);
        var datasetDirectory = GetDatasetDirectory(request);
        Directory.CreateDirectory(datasetDirectory);
        if (emptyDataset)
            await File.WriteAllBytesAsync(Path.Combine(datasetDirectory, $"{DatasetName}.000"), []);

        await File.WriteAllTextAsync(Path.Combine(outputDirectory, "S100_ROOT", "CATALOG.SIGN"), "signature");
        var indexPath = await WriteIndexAsync(outputDirectory, update: 0);
        var previousIndex = Path.Combine(outputDirectory, "prev.idx");
        await File.WriteAllTextAsync(previousIndex, "previous index");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            IsoIec8211ExportEngine.ReadS101ExportResultAsync(request, indexPath, previousIndex));

        Assert.Contains($"non-empty dataset for '{DatasetName}'", error.Message, StringComparison.Ordinal);
        Assert.True(File.Exists(indexPath));
        Assert.True(File.Exists(previousIndex));
    }

    [Fact]
    public async Task UpdateExchangeSetKeepsTheEditionDatasetAlongsideTheUpdate() {
        var request = CreateRequest(edition: 2, update: 1);
        var outputDirectory = GetCandidateDirectory(request);
        var datasetDirectory = GetDatasetDirectory(request);
        Directory.CreateDirectory(datasetDirectory);
        await File.WriteAllBytesAsync(Path.Combine(datasetDirectory, $"{DatasetName}.000"), [1]);
        await File.WriteAllBytesAsync(Path.Combine(datasetDirectory, $"{DatasetName}.001"), [2]);
        await File.WriteAllTextAsync(Path.Combine(outputDirectory, "S100_ROOT", "CATALOG.SIGN"), "signature");
        var indexPath = await WriteIndexAsync(outputDirectory, update: 1);

        var result = await IsoIec8211ExportEngine.ReadS101ExportResultAsync(request, indexPath, Path.Combine(outputDirectory, "prev.idx"));

        var exchangeSetArtifact = Assert.Single(result.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ExchangeSet);
        using var archive = new ZipArchive(new MemoryStream(exchangeSetArtifact.Content), ZipArchiveMode.Read);
        Assert.NotNull(archive.GetEntry($"S100_ROOT/S-101/DATASET_FILES/{DatasetName}.000"));
        Assert.NotNull(archive.GetEntry($"S100_ROOT/S-101/DATASET_FILES/{DatasetName}.001"));
        Assert.Equal($"{DatasetName}-2-001.zip", exchangeSetArtifact.FileName);
    }

    [Fact]
    public async Task DiscardUpdateDeletesOnlyTheTargetDatasetFile() {
        var request = CreateRequest(edition: 2, update: 1);
        var outputDirectory = GetCandidateDirectory(request);
        var datasetDirectory = GetDatasetDirectory(request);
        Directory.CreateDirectory(datasetDirectory);
        var baseDataset = Path.Combine(datasetDirectory, $"{DatasetName}.000");
        var updateDataset = Path.Combine(datasetDirectory, $"{DatasetName}.001");
        await File.WriteAllBytesAsync(baseDataset, [1]);
        await File.WriteAllBytesAsync(updateDataset, [2]);
        var signaturePath = Path.Combine(outputDirectory, "S100_ROOT", "CATALOG.SIGN");
        await File.WriteAllTextAsync(signaturePath, "signature");

        var engine = new IsoIec8211ExportEngine(NullLogger<IsoIec8211ExportEngine>.Instance, _root);
        await engine.DeleteOutputAsync(new ExportOutputIdentity(DatasetName, ProductSpecification.S101, 2, 1, _root));

        Assert.True(File.Exists(baseDataset));
        Assert.False(File.Exists(updateDataset));
        Assert.True(File.Exists(signaturePath));
    }

    [Fact]
    public async Task DiscardNewEditionDeletesTheWholeEditionDirectory() {
        var request = CreateRequest(edition: 2, update: 0);
        var outputDirectory = GetCandidateDirectory(request);
        Directory.CreateDirectory(outputDirectory);
        await File.WriteAllTextAsync(Path.Combine(outputDirectory, "marker.txt"), "candidate");

        var engine = new IsoIec8211ExportEngine(NullLogger<IsoIec8211ExportEngine>.Instance, _root);
        await engine.DeleteOutputAsync(new ExportOutputIdentity(DatasetName, ProductSpecification.S101, 2, 0, _root));

        Assert.False(Directory.Exists(outputDirectory));
    }

    private ExportEngineRequest CreateRequest(int edition, int update) =>
        new(DatasetName, ProductSpecification.S101, edition, update, _root, "source YAML");

    private static string GetCandidateDirectory(ExportEngineRequest request) =>
        ExportOutputPath.GetCandidateDirectory(request.OutputRoot, request.DatasetName, ProductSpecification.S101, request.Edition, request.Update);

    private static string GetDatasetDirectory(ExportEngineRequest request) =>
        ExportOutputPath.GetS101DatasetFilesDirectory(request.OutputRoot, request.DatasetName, request.Edition, request.Update);

    private static async Task<string> WriteIndexAsync(string directory, int update) {
        var indexPath = Path.Combine(directory, $"1OSTSO_{update:000}.idx");
        await File.WriteAllTextAsync(indexPath, "compiler index");
        return indexPath;
    }

    public void Dispose() {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }
}
