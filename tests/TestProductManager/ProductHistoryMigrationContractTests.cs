using ProductCatalogueAPI.Services.History;

namespace TestProductCatalogueAPI;

public class ProductHistoryMigrationContractTests
{
    [Fact]
    public void FrozenMigrationLengthsMatchCentralPersistenceContract()
    {
        var folder = MigrationFolder();
        var create = File.ReadAllText(Path.Combine(folder, "BE108A_001_CreateProductHistoryEvent.sql"));
        var verify = File.ReadAllText(Path.Combine(folder, "BE108A_001_VerifyProductHistoryEvent.sql"));
        var fields = new Dictionary<string, int> {
            ["DatasetName"] = ProductHistoryEventContract.DatasetNameMaxLength,
            ["EventType"] = ProductHistoryEventContract.EventTypeMaxLength,
            ["Outcome"] = ProductHistoryEventContract.OutcomeMaxLength,
            ["Code"] = ProductHistoryEventContract.CodeMaxLength,
            ["SafeMessage"] = ProductHistoryEventContract.SafeMessageMaxLength,
            ["CorrelationId"] = ProductHistoryEventContract.CorrelationIdMaxLength,
            ["JobId"] = ProductHistoryEventContract.JobIdMaxLength,
            ["ExportTarget"] = ProductHistoryEventContract.ExportTargetMaxLength,
            ["OperationMetadataJson"] = ProductHistoryEventContract.OperationMetadataJsonMaxLength
        };

        foreach (var field in fields)
        {
            Assert.Contains($"[{field.Key}] nvarchar({field.Value})", create);
            Assert.Contains($"(N'{field.Key}', N'nvarchar', {field.Value * 2}, 0,", verify);
        }

        Assert.Equal(SharedVerification(create), SharedVerification(verify));
        Assert.Contains("UNIQUE NONCLUSTERED ([OperationId] ASC)", create);
        Assert.Contains("i.ignore_dup_key <> 0", verify);
        Assert.Contains("c.default_object_id <> 0", verify);
    }

    [Fact]
    public void ProductStateHistoryPrerequisiteRequiresStablePrimaryKeyWithoutMutatingWorkflowSchema()
    {
        var folder = MigrationFolder();
        var prerequisites = new List<string>();
        foreach (var script in new[] { "Create", "Verify" })
        {
            var sql = File.ReadAllText(Path.Combine(folder, $"BE108A_001_{script}ProductHistoryEvent.sql"));
            var start = sql.IndexOf("DECLARE @StateHistoryTableId", StringComparison.Ordinal);
            var end = sql.IndexOf("-- BEGIN SHARED CONTRACT VERIFICATION", start, StringComparison.Ordinal);
            if (script == "Create")
                end = sql.IndexOf("IF OBJECT_ID(N'dbo.ProductHistoryEvent')", start, StringComparison.Ordinal);
            var prerequisite = sql[start..end];
            prerequisites.Add(prerequisite);

            Assert.Contains("OBJECT_ID(N'dbo.ProductStateHistory', N'U')", prerequisite);
            Assert.Contains("name = N'product_state_history_id'", prerequisite);
            Assert.Contains("system_type_id = TYPE_ID(N'uniqueidentifier')", prerequisite);
            Assert.Contains("is_nullable = 0 AND is_computed = 0 AND is_identity = 0", prerequisite);
            Assert.Contains("generated_always_type = 0", prerequisite);
            Assert.Contains("sys.key_constraints", prerequisite);
            Assert.Contains("k.type = N'PK'", prerequisite);
            Assert.Contains("i.is_unique = 1 AND i.is_primary_key = 1", prerequisite);
            Assert.Contains("ic.key_ordinal = 1", prerequisite);
            Assert.Contains("THROW 51080", prerequisite);
            Assert.Contains("THROW 51081", prerequisite);
            Assert.Contains("THROW 51082", prerequisite);
            Assert.DoesNotContain("default_object_id", prerequisite);
            Assert.DoesNotContain("newsequentialid", prerequisite.ToLowerInvariant());
            Assert.DoesNotContain("ALTER TABLE dbo.ProductStateHistory", sql);
            Assert.DoesNotContain("ALTER TABLE [dbo].[ProductStateHistory]", sql);
            Assert.DoesNotContain("dbo.JobTable", prerequisite);
        }

        Assert.Equal(prerequisites[0], prerequisites[1]);
    }

    private static string SharedVerification(string sql) => sql[
        sql.IndexOf("-- BEGIN SHARED CONTRACT VERIFICATION", StringComparison.Ordinal)..
        sql.IndexOf("-- END SHARED CONTRACT VERIFICATION", StringComparison.Ordinal)];

    internal static string MigrationFolder()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "src", "ProductCatalogueAPI", "Data", "Database", "Migrations");
            if (Directory.Exists(candidate)) return candidate;
        }
        throw new DirectoryNotFoundException("Run History tests from a complete repository checkout.");
    }
}
