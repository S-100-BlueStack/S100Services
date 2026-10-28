using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.History;
using System.Globalization;

namespace TestProductCatalogueAPI;

public class ProductHistoryEventTests
{
    [Theory]
    [InlineData("101dk001")]
    [InlineData("101DK001")]
    [InlineData("  101DK001  ")]
    public async Task DatasetNameIsCanonicalAtWriteAndQueryBoundaries(string input)
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var operationId = Guid.NewGuid();
        await service.CreatePendingAsync(new(operationId, input, " export "));
        Assert.Equal("101DK001", repository.Rows.Single().DatasetName);
        Assert.Equal("Export", repository.Rows.Single().EventType);
        Assert.Empty(await service.GetFinalizedByDatasetNameAsync(input));
        await service.FinalizeAsync(new(operationId, ProductHistoryResult.Succeeded));
        Assert.Single(await service.GetFinalizedByDatasetNameAsync(input));
        Assert.Equal("101DK001", repository.LastQuery);
        Assert.Empty(await service.GetFinalizedByDatasetNameAsync("101DK001X"));
    }

    [Fact]
    public void DatasetNameUsesInvariantUppercase()
    {
        var previous = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("tr-TR");
            Assert.Equal("101DI001", ProductHistoryEventContract.NormalizeDatasetName("101di001"));
        }
        finally { CultureInfo.CurrentCulture = previous; }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("name\nvalue")]
    [InlineData("name\tvalue")]
    [InlineData("name\0value")]
    [InlineData("name\u007fvalue")]
    public async Task InvalidDatasetNameIsRejectedBeforeRepositoryAccess(string? input)
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        await Assert.ThrowsAsync<ArgumentException>(() => service.CreatePendingAsync(new(Guid.NewGuid(), input!, "Export")));
        await Assert.ThrowsAsync<ArgumentException>(() => service.GetFinalizedByDatasetNameAsync(input!));
        Assert.Equal(0, repository.Accesses);
    }

    [Fact]
    public async Task OverlongDatasetNameIsRejectedAndMaximumLengthIsAccepted()
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var name = new string('A', ProductHistoryEventContract.DatasetNameMaxLength);
        await Assert.ThrowsAsync<ArgumentException>(() => service.CreatePendingAsync(new(Guid.NewGuid(), name + "A", "Export")));
        await Assert.ThrowsAsync<ArgumentException>(() => service.GetFinalizedByDatasetNameAsync(name + "A"));
        Assert.Equal(0, repository.Accesses);
        await service.CreatePendingAsync(new(Guid.NewGuid(), name, "Export"));
        Assert.Equal(name, repository.Rows.Single().DatasetName);
    }

    [Theory]
    [InlineData(" !example: alpha+beta (test) ", "!EXAMPLE: ALPHA+BETA (TEST)")]
    [InlineData("..example", "..EXAMPLE")]
    [InlineData("example/name", "EXAMPLE/NAME")]
    [InlineData("example\\name", "EXAMPLE\\NAME")]
    [InlineData("[example]@sample", "[EXAMPLE]@SAMPLE")]
    public async Task NonControlCharactersDoNotIntroduceAProductNamingGrammar(string input, string expected)
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var operationId = Guid.NewGuid();
        await service.CreatePendingAsync(new(operationId, input, "Export"));
        Assert.Equal(expected, repository.Rows.Single().DatasetName);
        await service.FinalizeAsync(new(operationId, ProductHistoryResult.Succeeded));
        Assert.Single(await service.GetFinalizedByDatasetNameAsync(input));
        Assert.Single(await service.GetFinalizedByDatasetNameAsync(expected.ToLowerInvariant()));
        Assert.Equal(expected, repository.LastQuery);
        Assert.Empty(await service.GetFinalizedByDatasetNameAsync(expected + "!"));
    }

    [Fact]
    public async Task DatasetNameLimitCountsUtf16CodeUnitsAfterCanonicalization()
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var name = string.Concat(Enumerable.Repeat("\U0001F600", 128));
        Assert.Equal(256, name.Length);
        await service.CreatePendingAsync(new(Guid.NewGuid(), "  " + name + "  ", "Export"));
        Assert.Equal(name, repository.Rows.Single().DatasetName);
        var accesses = repository.Accesses;
        await Assert.ThrowsAsync<ArgumentException>(() => service.CreatePendingAsync(new(Guid.NewGuid(), name + "a", "Export")));
        await Assert.ThrowsAsync<ArgumentException>(() => service.GetFinalizedByDatasetNameAsync(name + "a"));
        Assert.Equal(accesses, repository.Accesses);
    }

    [Theory]
    [InlineData("JobId", 128)]
    [InlineData("CorrelationId", 128)]
    [InlineData("Code", 128)]
    public void DiagnosticTokensAreBoundedAndRejectExceptionDetails(string field, int limit)
    {
        Assert.Equal(new string('a', limit), ProductHistoryEventContract.NormalizeToken(new string('a', limit), limit, field));
        Assert.Throws<ArgumentException>(() => ProductHistoryEventContract.NormalizeToken(new string('a', limit + 1), limit, field));
        Assert.Throws<ArgumentException>(() => ProductHistoryEventContract.NormalizeToken("SqlException: login failed; password=secret", limit, field));
        Assert.Throws<ArgumentException>(() => ProductHistoryEventContract.NormalizeToken("C:\\secret\\file", limit, field));
    }

    [Fact]
    public async Task InvalidSafeFieldsNeverReachRepository()
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var input = new ProductHistoryEventStart(Guid.NewGuid(), "101DK001", "Export");
        foreach (var invalid in new[] {
            input with { JobId = new string('A', 129) },
            input with { CorrelationId = new string('A', 129) },
            input with { EventType = new string('A', 65) },
            input with { ExportTarget = new string('A', 33) },
            input with { ExportTarget = "Future Target" },
            input with { OperationId = Guid.Empty },
            input with { EventType = "FutureProducer" }
        })
            await Assert.ThrowsAsync<ArgumentException>(() => service.CreatePendingAsync(invalid));
        Assert.Equal(0, repository.Accesses);
    }

    [Fact]
    public void MetadataIsStructuredBoundedAndCatalogControlled()
    {
        Assert.Equal("{\"ResultEdition\":\"2\",\"ResultUpdate\":null}", ProductHistoryEventContract.SerializeMetadata(
            new Dictionary<string, string?> { ["ResultUpdate"] = null, ["ResultEdition"] = "2" }));
        Assert.Throws<ArgumentException>(() => ProductHistoryEventContract.SerializeMetadata(
            Enumerable.Range(0, 9).ToDictionary(i => $"Key{i}", _ => (string?)"1")));
        foreach (var invalid in new[] {
            new Dictionary<string, string?> { [new string('A', 65)] = "1" },
            new Dictionary<string, string?> { ["ResultEdition"] = new string('1', 257) },
            new Dictionary<string, string?> { ["Exception"] = "SqlException" },
            new Dictionary<string, string?> { ["ResultEdition"] = "password=secret" },
            new Dictionary<string, string?> { ["ResultEdition"] = "01" },
            new Dictionary<string, string?> { ["ResultEdition"] = "1", [" ResultEdition "] = "2" }
        })
            Assert.Throws<ArgumentException>(() => ProductHistoryEventContract.SerializeMetadata(invalid));
        var json = ProductHistoryEventContract.SerializeMetadata(new Dictionary<string, string?> {
            ["ResultEdition"] = uint.MaxValue.ToString(CultureInfo.InvariantCulture), ["ResultUpdate"] = "0",
            ["PreviousEdition"] = "1", ["PreviousUpdate"] = null
        });
        Assert.True(json!.Length <= ProductHistoryEventContract.OperationMetadataJsonMaxLength);
    }

    [Theory]
    [InlineData(ProductHistoryResult.Succeeded, "Succeeded")]
    [InlineData(ProductHistoryResult.Failed, "Failed")]
    [InlineData(ProductHistoryResult.SucceededWithWarning, "SucceededWithWarning")]
    [InlineData(ProductHistoryResult.RequiresManualReview, "RequiresManualReview")]
    public async Task LifecycleFinalizesWithCatalogMessagesAndNeverOverwritesTerminalRows(ProductHistoryResult result, string outcome)
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var operationId = Guid.NewGuid();
        var id = await service.CreatePendingAsync(new(operationId, "101DK001", "Rollback", "42", "trace-1", "s101"));
        var pending = repository.Rows.Single();
        Assert.Equal(id, pending.Id);
        Assert.Null(pending.FinalizedAtUtc);
        Assert.Null(pending.OccurredAtUtc);
        Assert.Null(pending.ExecutionStartedAtUtc);
        Assert.Null(pending.Outcome);
        Assert.Equal("S101", pending.ExportTarget);
        Assert.True(await service.MarkExecutionStartedAsync(operationId));
        Assert.False(await service.MarkExecutionStartedAsync(operationId));
        Assert.True(await service.FinalizeAsync(new(operationId, result)));
        var terminal = Assert.Single(await service.GetFinalizedByDatasetNameAsync("101dk001"));
        Assert.Equal(outcome, terminal.Outcome);
        Assert.NotNull(terminal.ExecutionStartedAtUtc);
        Assert.NotNull(terminal.FinalizedAtUtc);
        Assert.Equal(terminal.FinalizedAtUtc, terminal.OccurredAtUtc);
        Assert.Equal(terminal.FinalizedAtUtc, terminal.UpdatedAtUtc);
        Assert.InRange(terminal.Code!.Length, 1, ProductHistoryEventContract.CodeMaxLength);
        Assert.InRange(terminal.SafeMessage!.Length, 1, ProductHistoryEventContract.SafeMessageMaxLength);
        Assert.False(await service.FinalizeAsync(new(operationId, ProductHistoryResult.Failed)));
        Assert.False(await service.MarkExecutionStartedAsync(operationId));
        Assert.Equal(terminal, repository.Rows.Single());
    }

    [Fact]
    public void PublicServiceContractCannotAcceptRawExceptionsMessagesCodesOrJson()
    {
        foreach (var inputType in new[] { typeof(ProductHistoryEventStart), typeof(ProductHistoryEventCompletion) })
        {
            var properties = inputType.GetProperties();
            Assert.DoesNotContain(properties, p => p.Name is "SafeMessage" or "Code" or "Outcome" or "OperationMetadataJson");
            Assert.DoesNotContain(properties, p => typeof(Exception).IsAssignableFrom(p.PropertyType));
        }
        Assert.DoesNotContain(typeof(IProductHistoryEventService).GetMethods().SelectMany(m => m.GetParameters()),
            p => typeof(Exception).IsAssignableFrom(p.ParameterType));
        Assert.Throws<ArgumentOutOfRangeException>(() => ProductHistorySafeMessages.Resolve((ProductHistoryResult)999));
        Assert.Throws<ArgumentException>(() => ProductHistoryEventContract.RequiredText(new string('x', 1025), 1024, "SafeMessage"));
    }

    [Fact]
    public async Task SuccessfulStateReferenceIsPreservedAndFailureReferencesAreRejectedBeforeAccess()
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var operationId = Guid.NewGuid();
        var stateId = Guid.NewGuid();
        await Assert.ThrowsAsync<ArgumentException>(() => service.FinalizeAsync(new(operationId, ProductHistoryResult.Failed, stateId)));
        await Assert.ThrowsAsync<ArgumentException>(() => service.FinalizeAsync(new(operationId, ProductHistoryResult.Succeeded, Guid.Empty)));
        Assert.Equal(0, repository.Accesses);
        await service.CreatePendingAsync(new(operationId, "101DK001", "Export"));
        Assert.True(await service.FinalizeAsync(new(operationId, ProductHistoryResult.Succeeded, stateId)));
        Assert.Equal(stateId, repository.Rows.Single().StateRecordId);
    }

    [Fact]
    public async Task DuplicateOperationIsRejectedByPersistenceContract()
    {
        var repository = new HistoryMemoryRepository();
        var service = CreateService(repository);
        var input = new ProductHistoryEventStart(Guid.NewGuid(), "101DK001", "Export");
        await service.CreatePendingAsync(input);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreatePendingAsync(input));
        Assert.Single(repository.Rows);
    }

    [Fact]
    public async Task PendingRowsAreExcludedAndUnknownPersistedValuesRemainReadable()
    {
        var repository = new HistoryMemoryRepository { ReturnPendingForVisibilityTest = true };
        var service = CreateService(repository);
        await service.CreatePendingAsync(new(Guid.NewGuid(), "101DK001", "Export"));
        repository.Rows.Add(new ProductHistoryEventRecord {
            Id = Guid.NewGuid(), OperationId = Guid.NewGuid(), DatasetName = "101DK001",
            EventType = "FutureProducerType", Outcome = "FutureOutcome", FinalizedAtUtc = DateTime.UtcNow,
            OccurredAtUtc = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified), OperationMetadataJson = "[1,2]"
        });
        var response = ProductHistoryEventResponse.FromRecord(Assert.Single(await service.GetFinalizedByDatasetNameAsync("101dk001")));
        Assert.Equal("FutureProducerType", response.EventType);
        Assert.Equal("FutureOutcome", response.Outcome);
        Assert.Equal(DateTimeKind.Utc, response.OccurredAtUtc!.Value.Kind);
        Assert.Null(response.OperationMetadata);
    }

    internal static ProductHistoryEventService CreateService(HistoryMemoryRepository repository) => new(repository, TimeProvider.System);
}

internal sealed class HistoryMemoryRepository : IProductHistoryEventRepository
{
    internal List<ProductHistoryEventRecord> Rows { get; } = [];
    internal int Accesses { get; private set; }
    internal string? LastQuery { get; private set; }
    internal bool ReturnPendingForVisibilityTest { get; init; }

    public Task InsertPendingAsync(ProductHistoryEventRecord record)
    {
        Accesses++;
        if (Rows.Any(r => r.OperationId == record.OperationId)) throw new InvalidOperationException("Duplicate OperationId.");
        Rows.Add(record);
        return Task.CompletedTask;
    }
    public Task<ProductHistoryEventRecord?> GetByOperationIdAsync(Guid operationId)
    {
        Accesses++;
        return Task.FromResult(Rows.SingleOrDefault(r => r.OperationId == operationId));
    }
    public Task<bool> MarkExecutionStartedAsync(Guid operationId, DateTime nowUtc)
    {
        Accesses++;
        var index = Rows.FindIndex(r => r.OperationId == operationId && r.FinalizedAtUtc == null && r.ExecutionStartedAtUtc == null);
        if (index < 0) return Task.FromResult(false);
        Rows[index] = Rows[index] with { ExecutionStartedAtUtc = nowUtc, UpdatedAtUtc = nowUtc };
        return Task.FromResult(true);
    }
    public Task<bool> TryFinalizeAsync(ProductHistoryEventRecord record)
    {
        Accesses++;
        var index = Rows.FindIndex(r => r.Id == record.Id && r.OperationId == record.OperationId && r.FinalizedAtUtc == null);
        if (index < 0) return Task.FromResult(false);
        Rows[index] = record;
        return Task.FromResult(true);
    }
    public Task<IReadOnlyList<ProductHistoryEventRecord>> GetFinalizedByDatasetNameAsync(string canonicalDatasetName)
    {
        Accesses++;
        LastQuery = canonicalDatasetName;
        return Task.FromResult<IReadOnlyList<ProductHistoryEventRecord>>(Rows.Where(r =>
            r.DatasetName.Equals(canonicalDatasetName, StringComparison.Ordinal) &&
            (ReturnPendingForVisibilityTest || r.FinalizedAtUtc.HasValue)).ToArray());
    }
}
