using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class ExportSnapshotVersioningTests
{
    [Fact]
    public void CompilerSnapshotKeepsCandidateUpdateOutOfYaml() {
        var dataset = new S100FC.YAML.Dataset { Edition = 1, Update = 7 };

        ExportSnapshotVersioning.ApplyCompilerCompatibleVersion(dataset, 5);

        Assert.Equal(5u, dataset.Edition);
        Assert.Null(dataset.Update);
    }
}
