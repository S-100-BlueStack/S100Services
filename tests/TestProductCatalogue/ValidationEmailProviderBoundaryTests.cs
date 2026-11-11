using ProductCatalogueAPI.Services.ValidationEmail;

namespace TestProductCatalogue;

/// <summary>Protects provider independence and configuration compatibility during the naming change.</summary>
public sealed class ValidationEmailProviderBoundaryTests
{
    /// <summary>The core can consume a different provider without referencing its report template or company name.</summary>
    [Fact]
    public async Task CoreProcessesAnotherProviderThroughItsParserBoundary() {
        var store = new Store();
        var sink = new Decisions();
        var message = new ValidationEmailMessage("other-provider-1", null, "partner@example.invalid", DateTimeOffset.UtcNow, "Partner-specific subject", "Partner-specific body", [], true);
        var result = await new ValidationEmailProcessor(new OtherProviderParser(), store, sink).ProcessAsync(Guid.NewGuid(), message, false, DateTimeOffset.MinValue, null, default);
        Assert.Equal("Applied", result.Status);
        Assert.Equal(1, sink.Calls);
        Assert.Equal(2, store.Writes);
    }

    /// <summary>Legacy settings continue to work while explicit neutral settings take precedence.</summary>
    [Theory]
    [InlineData("Simulation", null, ValidationEmailMode.Simulation)]
    [InlineData("Live", "Disabled", ValidationEmailMode.Disabled)]
    [InlineData(null, "Simulation", ValidationEmailMode.Simulation)]
    public void ConfigurationUsesNeutralSettingsWithLegacyFallback(string? legacy, string? current, ValidationEmailMode expected) {
        var values = new Dictionary<string, string?>();
        if (legacy is not null) values["IcEncEmail:Mode"] = legacy;
        if (current is not null) values["ValidationEmail:Mode"] = current;
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var options = new ValidationEmailOptions();
        ValidationEmailOptions.BindSettings(configuration, options);
        Assert.Equal(expected, options.Mode);
        if (expected != ValidationEmailMode.Live) Assert.True(options.IsValid());
    }

    private sealed class OtherProviderParser : IValidationEmailParser
    {
        public string ProviderName => "Other partner";
        public bool IsRelevantSubject(string subject) => true;
        public bool IsRelevantAttachment(string name) => false;
        public ValidationEmailParseResult Parse(ValidationEmailMessage message) => new() { Outcome = ValidationEmailOutcome.Accepted, FileName = "DK5OTERP.000", Specification = "S57", Edition = 3, Update = 0, CanMatch = true };
    }
    private sealed class Store : IValidationEmailStore
    {
        public int Writes { get; private set; }
        public Task<IReadOnlyList<ValidationOutgoingFile>> FindOutgoingAsync(string fileName, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<ValidationOutgoingFile>>([new(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "DK5OTERP", "S57", 3, 0, fileName, null, DateTime.UtcNow.AddHours(-1), "Delivered")]);
        public Task SaveResultAsync(Guid id, ValidationEmailProcessingResult result, IReadOnlyList<ValidationEmailAttachment> attachments, CancellationToken cancellationToken) { Writes++; return Task.CompletedTask; }
    }
    private sealed class Decisions : IValidationEmailDecisionSink
    {
        public int Calls { get; private set; }
        public Task<bool> ApplyAsync(Guid id, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) { Calls++; return Task.FromResult(true); }
    }
}
