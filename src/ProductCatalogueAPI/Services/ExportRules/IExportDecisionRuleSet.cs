using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.ExportRules;

/// <summary>
/// Decides whether an accumulated summary becomes an Update or NewEdition for one independent product specification.
/// </summary>
public interface IExportDecisionRuleSet
{
    /// <summary>Gets the product specification evaluated by this ruleset.</summary>
    ProductSpecification ProductSpecification { get; }

    /// <summary>Evaluates a complete daily change summary.</summary>
    ExportDecision Evaluate(ProductChangeSummary summary);
}

/// <summary>Represents a ruleset outcome. A null revision means policy is not implemented or no export is required.</summary>
public sealed record ExportDecision(ExportRevisionType? RevisionType, string Reason)
{
    /// <summary>Creates the explicit pending-policy outcome used by scaffolds.</summary>
    public static ExportDecision PendingRules(string reason) => new(null, reason);
}

/// <summary>Resolves independent format-specific rulesets.</summary>
public interface IExportDecisionRuleSetRegistry
{
    /// <summary>Gets the one ruleset registered for a product specification.</summary>
    IExportDecisionRuleSet GetRequired(ProductSpecification productSpecification);
}

/// <summary>Resolves exactly one format-specific ruleset.</summary>
public sealed class ExportDecisionRuleSetRegistry(IEnumerable<IExportDecisionRuleSet> ruleSets) : IExportDecisionRuleSetRegistry
{
    private readonly IExportDecisionRuleSet[] _ruleSets = [.. ruleSets];

    /// <inheritdoc/>
    public IExportDecisionRuleSet GetRequired(ProductSpecification productSpecification) {
        var matches = _ruleSets.Where(ruleSet => ruleSet.ProductSpecification == productSpecification).ToArray();
        return matches.Length switch {
            1 => matches[0],
            0 => throw new InvalidOperationException($"No export decision ruleset is registered for {productSpecification}."),
            _ => throw new InvalidOperationException($"Multiple export decision rulesets are registered for {productSpecification}.")
        };
    }
}

/// <summary>
/// Holds S-101/S-128 publication summaries until the real edition/update rules are supplied.
/// </summary>
public sealed class PendingS101ExportDecisionRuleSet : IExportDecisionRuleSet
{
    /// <inheritdoc/>
    public ProductSpecification ProductSpecification => ProductSpecification.S101;

    /// <inheritdoc/>
    public ExportDecision Evaluate(ProductChangeSummary summary) => ExportDecision.PendingRules("The S-101/S-128 NewEdition-versus-Update ruleset has not been implemented.");
}

/// <summary>
/// Holds S-57 summaries until the independent S-57 edition/update rules are supplied.
/// </summary>
public sealed class PendingS57ExportDecisionRuleSet : IExportDecisionRuleSet
{
    /// <inheritdoc/>
    public ProductSpecification ProductSpecification => ProductSpecification.S57;

    /// <inheritdoc/>
    public ExportDecision Evaluate(ProductChangeSummary summary) => ExportDecision.PendingRules("The S-57 NewEdition-versus-Update ruleset has not been implemented.");
}
