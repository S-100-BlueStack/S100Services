using System.Text.Json;
using S100FC.S128.FeatureAssociation;
using S100FC.S128.FeatureTypes;

namespace S100FC.ProductCatalogue.CatalogueMapping;

internal sealed record ElectronicProductCatalogueEntry(string FeatureId, ElectronicProduct Product, string? FeatureBindings);

/// <summary>
/// Resolves S-128 ElectronicProduct relationships exclusively through ProductMapping feature bindings.
/// Dataset names identify products but are never used to infer relationships between products.
/// </summary>
internal sealed class ElectronicProductMappingIndex
{
    private sealed record ProductIdentity(string ProductSpecification, string DatasetName);

    private readonly Dictionary<ProductIdentity, ElectronicProduct> _productsByIdentity;
    private readonly Dictionary<ProductIdentity, HashSet<ProductIdentity>> _relationships;

    private ElectronicProductMappingIndex(Dictionary<ProductIdentity, ElectronicProduct> productsByIdentity, Dictionary<ProductIdentity, HashSet<ProductIdentity>> relationships) {
        _productsByIdentity = productsByIdentity;
        _relationships = relationships;
    }

    public static ElectronicProductMappingIndex Empty { get; } = Create([]);

    /// <summary>
    /// Resolves a product by its own dataset name and rejects duplicate names across product specifications.
    /// </summary>
    /// <param name="datasetName">The dataset name stored in the S-128 ElectronicProduct attributes.</param>
    /// <returns>The unique product with that dataset name, or <see langword="null"/> when no product exists.</returns>
    /// <exception cref="ProductMappingIntegrityException">Thrown when the same dataset name is used by multiple product specifications.</exception>
    public ElectronicProduct? ResolveByDatasetName(string datasetName) {
        var normalizedName = NormalizeDatasetName(datasetName);
        var matches = _productsByIdentity
            .Where(pair => pair.Key.DatasetName == normalizedName)
            .Select(pair => pair.Value)
            .ToArray();

        return matches.Length switch {
            0 => null,
            1 => matches[0],
            _ => throw new ProductMappingIntegrityException($"Dataset '{datasetName}' is used by multiple S-128 ElectronicProducts with different product specifications.")
        };
    }

    public static ElectronicProductMappingIndex Create(IEnumerable<ElectronicProductCatalogueEntry> entries) {
        var materialized = entries.ToArray();
        var productsByIdentity = new Dictionary<ProductIdentity, ElectronicProduct>();
        var identityByFeatureId = new Dictionary<string, ProductIdentity>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in materialized) {
            var identity = CreateIdentity(entry.Product);
            if (string.IsNullOrWhiteSpace(identity.DatasetName) || string.IsNullOrWhiteSpace(identity.ProductSpecification))
                continue;
            if (!productsByIdentity.TryAdd(identity, entry.Product))
                throw new ProductMappingIntegrityException($"Multiple S-128 ElectronicProduct rows use dataset '{entry.Product.datasetName}' and specification '{entry.Product.productSpecification?.name}'.");

            var featureId = NormalizeFeatureId(entry.FeatureId);
            if (string.IsNullOrWhiteSpace(featureId))
                continue;
            if (!identityByFeatureId.TryAdd(featureId, identity))
                throw new ProductMappingIntegrityException($"Multiple S-128 ElectronicProduct rows use feature ID '{entry.FeatureId}'.");
        }

        var relationships = new Dictionary<ProductIdentity, HashSet<ProductIdentity>>();
        foreach (var entry in materialized) {
            var source = CreateIdentity(entry.Product);
            if (!productsByIdentity.ContainsKey(source))
                continue;

            foreach (var targetFeatureId in ReadProductMappingTargets(entry.FeatureBindings)) {
                if (!identityByFeatureId.TryGetValue(targetFeatureId, out var target) || source == target)
                    continue;

                AddRelationship(relationships, source, target);
                AddRelationship(relationships, target, source);
            }
        }

        return new ElectronicProductMappingIndex(productsByIdentity, relationships);
    }

    public ElectronicProduct? Resolve(string datasetName, string productSpecification) {
        var exactIdentity = new ProductIdentity(NormalizeProductSpecification(productSpecification), NormalizeDatasetName(datasetName));
        if (_productsByIdentity.TryGetValue(exactIdentity, out var exact))
            return exact;

        var mapped = GetMapped(datasetName, productSpecification);
        return mapped.Count switch {
            0 => null,
            1 => mapped[0],
            _ => throw new ProductMappingIntegrityException($"Dataset '{datasetName}' maps to multiple {productSpecification} ElectronicProducts: {string.Join(", ", mapped.Select(product => product.datasetName))}.")
        };
    }

    public IReadOnlyList<ElectronicProduct> GetMapped(string datasetName, string productSpecification) {
        var normalizedName = NormalizeDatasetName(datasetName);
        var normalizedSpecification = NormalizeProductSpecification(productSpecification);
        var sourceIdentities = _productsByIdentity.Keys.Where(identity => identity.DatasetName == normalizedName).ToArray();
        var results = new Dictionary<ProductIdentity, ElectronicProduct>();

        foreach (var source in sourceIdentities) {
            if (!_relationships.TryGetValue(source, out var related))
                continue;
            foreach (var target in related.Where(identity => identity.ProductSpecification == normalizedSpecification))
                results[target] = _productsByIdentity[target];
        }

        return results.OrderBy(pair => pair.Key.DatasetName, StringComparer.OrdinalIgnoreCase).Select(pair => pair.Value).ToArray();
    }

    /// <summary>Reads ProductMapping target IDs from flattened S-128 feature bindings.</summary>
    /// <param name="featureBindings">The stored featurebindings JSON for one ElectronicProduct row.</param>
    /// <returns>Normalized target IDs for ProductMapping associations to ElectronicProducts.</returns>
    private static IReadOnlyList<string> ReadProductMappingTargets(string? featureBindings) {
        if (string.IsNullOrWhiteSpace(featureBindings))
            return [];

        try {
            var properties = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(featureBindings);
            if (properties is null)
                return [];

            // The index reads association codes. Association attributes require one concrete type for the entire array.
            var metadata = properties
                .Where(property => !property.Key.Contains("].association.attributes", StringComparison.Ordinal))
                .ToDictionary();
            var unflattenedFeatureBindings = AttributeFlattenExtensions.UnflattenFeatureBindings(JsonSerializer.Serialize(metadata));
            return unflattenedFeatureBindings
                .Where(binding => binding?.association is { } association &&
                    string.Equals(binding.featureType, nameof(ElectronicProduct), StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(association.S100FC_code, nameof(ProductMapping), StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(binding.featureId))
                .Select(binding => NormalizeFeatureId(binding.featureId))
                .ToArray();
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or ArgumentException or OverflowException) {
            return [];
        }
    }

    private static void AddRelationship(Dictionary<ProductIdentity, HashSet<ProductIdentity>> relationships, ProductIdentity source, ProductIdentity target) {
        if (!relationships.TryGetValue(source, out var targets)) {
            targets = [];
            relationships[source] = targets;
        }
        targets.Add(target);
    }

    private static ProductIdentity CreateIdentity(ElectronicProduct product) => new(NormalizeProductSpecification(product.productSpecification?.name), NormalizeDatasetName(product.datasetName));
    private static string NormalizeFeatureId(string? value) => value?.Trim().ToUpperInvariant() ?? string.Empty;
    private static string NormalizeDatasetName(string? value) => value?.Trim().ToUpperInvariant() ?? string.Empty;
    private static string NormalizeProductSpecification(string? value) => value?.Replace("-", string.Empty, StringComparison.Ordinal).Trim().ToUpperInvariant() ?? string.Empty;
}
