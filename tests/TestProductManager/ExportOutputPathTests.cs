using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Export;

namespace TestProductCatalogueAPI;

public sealed class ExportOutputPathTests
{
    [Fact]
    public void S101DatasetFilesUseDatasetAndEditionWithoutSpecificationOrUpdateFolders() {
        var path = ExportOutputPath.GetS101DatasetFilesDirectory("ProductCatalogue\\export", "101DK005EGENS", 1, 0);

        Assert.Equal(Path.Combine("ProductCatalogue\\export", "101DK005EGENS", "1", "S100_ROOT", "S-101", "DATASET_FILES"), path);
        Assert.False(path.Contains($"{Path.DirectorySeparatorChar}S101{Path.DirectorySeparatorChar}", StringComparison.Ordinal));
        Assert.False(path.Contains($"{Path.DirectorySeparatorChar}000{Path.DirectorySeparatorChar}", StringComparison.Ordinal));
    }

    [Fact]
    public void NonS101CandidatesKeepIndependentSpecificationAndUpdateFolders() {
        var path = ExportOutputPath.GetCandidateDirectory("export", "101DK005EGENS", ProductSpecification.S57, 1, 2);

        Assert.Equal(Path.Combine("export", "101DK005EGENS", "S57", "1", "002"), path);
    }
}
