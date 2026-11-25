using System.IO.Compression;
using System.Text;
using System.Xml;
using ProductCatalogueAPI.Services.BathymetricSurfaces;

namespace TestProductCatalogueAPI;

/// <summary>Checks the external bathymetric exchange-set boundary without ArcGIS, SQL Server or FTP.</summary>
public sealed class BathymetricExchangeSetTests
{
    private const string DatasetName = "102DK00TEST";
    private const string DatasetPath = "S100_ROOT/S-102/DATASET_FILES/102DK00TEST.H5";

    /// <summary>A namespaced exchange catalogue identifies the dataset and its new edition.</summary>
    [Fact]
    public async Task ReadsEditionForTheExpectedDataset() {
        using var archive = CreateArchive(DatasetPath, Catalogue(DatasetName + ".H5"));
        var edition = await BathymetricExchangeSet.ReadEditionAsync(archive, DatasetName + ".H5", CancellationToken.None);

        Assert.Equal(3, edition);
        Assert.Equal(3, BathymetricExchangeSet.GetFiles(archive, DatasetName).Count);
    }

    /// <summary>Rejects an omitted signature, path traversal, a duplicate dataset, or a mismatched dataset filename.</summary>
    [Theory]
    [InlineData(null, false)]
    [InlineData("S100_ROOT/S-102/../OTHER.H5", true)]
    [InlineData("S100_ROOT/S-102/DATASET_FILES/OTHER.H5", true)]
    [InlineData(DatasetPath, true)]
    public void RejectsInvalidExchangeSetLayout(string? additionalPath, bool includeSignature) {
        using var archive = CreateArchive(DatasetPath, Catalogue(DatasetName + ".H5"), includeSignature, additionalPath);

        Assert.Throws<InvalidDataException>(() => BathymetricExchangeSet.GetFiles(archive, DatasetName));
    }

    /// <summary>Rejects a catalogue whose discovery metadata references a different dataset.</summary>
    [Fact]
    public async Task RejectsMismatchedDiscoveryMetadata() {
        using var archive = CreateArchive(DatasetPath, Catalogue("102DK00OTHER.H5"));

        await Assert.ThrowsAsync<InvalidDataException>(() => BathymetricExchangeSet.ReadEditionAsync(archive, DatasetName, CancellationToken.None));
    }

    /// <summary>Rejects external entity resolution in catalogue XML.</summary>
    [Fact]
    public async Task RejectsAnXmlDocumentType() {
        using var archive = CreateArchive(DatasetPath, "<!DOCTYPE Catalogue [<!ENTITY external SYSTEM 'file:///example'>]><Catalogue>&external;</Catalogue>");

        await Assert.ThrowsAsync<XmlException>(() => BathymetricExchangeSet.ReadEditionAsync(archive, DatasetName, CancellationToken.None));
    }

    private static string Catalogue(string fileName) => $"""
        <S100_ExchangeCatalogue xmlns="http://www.iho.int/s100/5.2">
          <datasetDiscoveryMetadata>
            <S100_DatasetDiscoveryMetadata>
              <fileName>file:/S100_ROOT/S-102/DATASET_FILES/{fileName}</fileName>
              <editionNumber>3</editionNumber>
            </S100_DatasetDiscoveryMetadata>
          </datasetDiscoveryMetadata>
        </S100_ExchangeCatalogue>
        """;

    private static ZipArchive CreateArchive(string path, string catalogue, bool includeSignature = true, string? additionalPath = null) {
        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true)) {
            AddEntry(archive, "S100_ROOT/CATALOG.XML", catalogue);
            if (includeSignature)
                AddEntry(archive, "S100_ROOT/CATALOG.SIGN", "fixture");
            AddEntry(archive, path, "fixture");
            if (additionalPath is not null)
                AddEntry(archive, additionalPath, "other");
        }
        stream.Position = 0;
        return new ZipArchive(stream, ZipArchiveMode.Read);
    }

    private static void AddEntry(ZipArchive archive, string path, string content) {
        using var stream = archive.CreateEntry(path).Open();
        stream.Write(Encoding.UTF8.GetBytes(content));
    }
}
