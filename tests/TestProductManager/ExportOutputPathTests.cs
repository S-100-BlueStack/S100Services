using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Export;

namespace TestProductCatalogueAPI;

public sealed class ExportOutputPathTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    public void S101DatasetFilesUseCompilerDatasetSubdirectoryWithoutSpecificationOrUpdateFolders(int update) {
        var path = ExportOutputPath.GetS101DatasetFilesDirectory("ProductCatalogue\\export", "101DK005EGENS", 1, update);

        Assert.Equal(Path.Combine("ProductCatalogue\\export", "101DK005EGENS", "1", "101DK005EGENS", "S100_ROOT", "S-101", "DATASET_FILES"), path);
        Assert.False(path.Contains($"{Path.DirectorySeparatorChar}S101{Path.DirectorySeparatorChar}", StringComparison.Ordinal));
        Assert.False(path.Contains($"{Path.DirectorySeparatorChar}000{Path.DirectorySeparatorChar}", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    public void S101ExchangeSetIsNestedWithinTheEditionRoot(int update) {
        var path = ExportOutputPath.GetS101ExchangeSetDirectory("export", "101DK001OSTSO", 1, update);

        Assert.Equal(Path.Combine("export", "101DK001OSTSO", "1", "101DK001OSTSO", "S100_ROOT"), path);
    }

    [Fact]
    public void S101CandidateDirectoryIsTheCompilerEditionRoot() {
        var path = ExportOutputPath.GetCandidateDirectory("export", "101DK001OSTSO", ProductSpecification.S101, 1, 0);

        Assert.Equal(Path.Combine("export", "101DK001OSTSO", "1"), path);
    }

    [Fact]
    public void NonS101CandidatesKeepIndependentSpecificationAndUpdateFolders() {
        var path = ExportOutputPath.GetCandidateDirectory("export", "101DK005EGENS", ProductSpecification.S57, 1, 2);

        Assert.Equal(Path.Combine("export", "101DK005EGENS", "S57", "1", "002"), path);
    }
}
