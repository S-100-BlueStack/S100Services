using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace TestProductCatalogueAPI;

/// <summary>Checks actual S-57 export ZIPs against send preflight without compilers, SQL or ArcGIS calls.</summary>
public sealed class S57ExchangeSetOutputTests : IDisposable
{
    private const string DatasetName = "DK41335E";
    private const string SourceName = "101DK0041335E";
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"pc-s57-output-{Guid.NewGuid():N}");

    /// <summary>Every compiler layout accepted by validation must produce a transport-rooted archive with unchanged data and catalogue bytes.</summary>
    [Theory]
    [InlineData("flat", 0)]
    [InlineData("root", 0)]
    [InlineData("wrapped-root", 0)]
    [InlineData("flat", 1)]
    [InlineData("root", 1)]
    [InlineData("wrapped-root", 1)]
    public async Task CompilerLayoutsProduceSendableArchivesWithoutStagingInputs(string layout, int update) {
        var request = Request(update);
        var output = Output(request);
        var exchangeRoot = layout switch {
            "root" => Path.Combine(output, "ENC_ROOT"),
            "wrapped-root" => Path.Combine(output, DatasetName, "ENC_ROOT"),
            _ => output
        };
        var cells = layout == "flat" ? exchangeRoot : Path.Combine(exchangeRoot, "cells");
        Directory.CreateDirectory(cells);
        var data = Encoding.ASCII.GetBytes("123456789");
        await File.WriteAllBytesAsync(Path.Combine(cells, DatasetName + ".000"), data);
        if (update > 0)
            await File.WriteAllBytesAsync(Path.Combine(cells, DatasetName + ".001"), data);
        var catalogue = new byte[] { 0, 1, 2, 255 };
        await File.WriteAllBytesAsync(Path.Combine(exchangeRoot, "CATALOG.031"), catalogue);
        var support = Path.Combine(exchangeRoot, "support");
        Directory.CreateDirectory(support);
        await File.WriteAllTextAsync(Path.Combine(support, "notes.txt"), "dataset support");
        await File.WriteAllTextAsync(Path.Combine(output, SourceName + ".yaml"), "shared source input");
        await File.WriteAllTextAsync(Path.Combine(output, DatasetName + ".yaml"), "mapped staging input");

        var result = await IsoIec8211ExportEngine.ReadS57ExportResultAsync(request);

        Assert.Equal(output, result.OutputDirectory);
        var artifact = Assert.Single(result.Artifacts);
        Assert.Equal(ProductArtifactKind.ExchangeSet, artifact.Kind);
        Assert.Equal($"{DatasetName}-2-{update:000}.zip", artifact.FileName);
        var manifest = ValidationOutgoingManifest.Read(artifact.Content, "S57", DatasetName, update);
        Assert.Equal(update + 1, manifest.Length);
        Assert.All(manifest, item => {
            Assert.Equal("CBF43926", item.Crc);
            Assert.Equal(SHA256.HashData(data), item.Sha256);
        });
        using var memory = new MemoryStream(artifact.Content);
        using var zip = new ZipArchive(memory, ZipArchiveMode.Read);
        Assert.Equal(update + 3, zip.Entries.Count);
        Assert.All(zip.Entries, entry => {
            Assert.StartsWith("ENC_ROOT/", entry.FullName);
            Assert.DoesNotContain('\\', entry.FullName);
            Assert.False(entry.FullName.EndsWith(".yaml", StringComparison.OrdinalIgnoreCase));
        });
        var prefix = layout == "flat" ? "ENC_ROOT/" : "ENC_ROOT/cells/";
        Assert.Equal(data, await ReadAsync(zip, prefix + DatasetName + ".000"));
        Assert.Equal(catalogue, await ReadAsync(zip, "ENC_ROOT/CATALOG.031"));
        Assert.Equal("dataset support", Encoding.UTF8.GetString(await ReadAsync(zip, "ENC_ROOT/support/notes.txt")));
        Assert.True(File.Exists(Path.Combine(output, SourceName + ".yaml")));
        Assert.True(File.Exists(Path.Combine(output, DatasetName + ".yaml")));
    }

    /// <summary>A successful compiler exit cannot produce an artifact when its exact requested update is missing or empty.</summary>
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MissingOrEmptyOutgoingUpdateFailsExport(bool empty) {
        var request = Request(1);
        var output = Output(request);
        Directory.CreateDirectory(output);
        await File.WriteAllBytesAsync(Path.Combine(output, DatasetName + ".000"), [1]);
        if (empty)
            await File.WriteAllBytesAsync(Path.Combine(output, DatasetName + ".001"), []);
        await Assert.ThrowsAsync<InvalidOperationException>(() => IsoIec8211ExportEngine.ReadS57ExportResultAsync(request));
    }

    /// <summary>Normalization never substitutes a different cell or chooses an arbitrary duplicate base file.</summary>
    [Theory]
    [InlineData("missing")]
    [InlineData("empty")]
    [InlineData("duplicate")]
    public async Task MissingEmptyOrAmbiguousBaseCannotBecomeReady(string scenario) {
        var request = Request();
        var output = Output(request);
        Directory.CreateDirectory(output);
        await File.WriteAllBytesAsync(Path.Combine(output, "DK30557D.000"), [99]);
        if (scenario != "missing")
            await File.WriteAllBytesAsync(Path.Combine(output, DatasetName + ".000"), scenario == "empty" ? [] : [1]);
        if (scenario == "duplicate") {
            var duplicate = Path.Combine(output, "ENC_ROOT");
            Directory.CreateDirectory(duplicate);
            await File.WriteAllBytesAsync(Path.Combine(duplicate, DatasetName + ".000"), [2]);
        }
        await Assert.ThrowsAsync<InvalidOperationException>(() => IsoIec8211ExportEngine.ReadS57ExportResultAsync(request));
    }

    /// <summary>The completed ZIP must satisfy send rules before storage, rather than deferring a wrong-cell failure until Send.</summary>
    [Fact]
    public async Task ForeignCellInExchangeSetFailsExportPreflight() {
        var request = Request();
        var output = Output(request);
        Directory.CreateDirectory(output);
        await File.WriteAllBytesAsync(Path.Combine(output, DatasetName + ".000"), [1]);
        await File.WriteAllBytesAsync(Path.Combine(output, "DK30557D.000"), [2]);
        await Assert.ThrowsAsync<InvalidDataException>(() => IsoIec8211ExportEngine.ReadS57ExportResultAsync(request));
    }

    /// <summary>Cancellation stops before reading an output directory or constructing an exchange set.</summary>
    [Fact]
    public async Task CancelledExportDoesNotReadCompilerOutput() {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => IsoIec8211ExportEngine.ReadS57ExportResultAsync(Request(), cancellation.Token));
        Assert.False(Directory.Exists(_root));
    }

    /// <summary>Creates an isolated mapped S-57 candidate with the production output identity.</summary>
    private ExportEngineRequest Request(int update = 0) => new(DatasetName, ProductSpecification.S57, 2, update, _root, "source YAML", SourceDatasetName: SourceName);

    /// <summary>Uses the same absolute candidate path as the export engine.</summary>
    private static string Output(ExportEngineRequest request) => Path.GetFullPath(ExportOutputPath.GetCandidateDirectory(request.OutputRoot, request.DatasetName, request.ProductSpecification, request.Edition, request.Update));

    /// <summary>Reads a required ZIP entry to verify exact content preservation.</summary>
    private static async Task<byte[]> ReadAsync(ZipArchive zip, string name) {
        var entry = zip.GetEntry(name);
        Assert.NotNull(entry);
        await using var source = entry!.Open();
        using var content = new MemoryStream();
        await source.CopyToAsync(content);
        return content.ToArray();
    }

    /// <summary>Deletes only the temporary directory created by this test instance.</summary>
    public void Dispose() {
        if (Directory.Exists(_root))
            Directory.Delete(_root, true);
    }
}
