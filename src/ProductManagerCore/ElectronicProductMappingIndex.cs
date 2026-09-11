using S100FC.S128.FeatureTypes;
using System.Text.Json;

namespace S100FC.ProductCatalogue;

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
    public ElectronicProduct? ResolveByDatasetName(string datasetName)
    {
        var normalizedName = NormalizeDatasetName(datasetName);
        var matches = _productsByIdentity
            .Where(pair => pair.Key.DatasetName == normalizedName)
            .Select(pair => pair.Value)
            .ToArray();

        return matches.Length switch
        {
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

    private static IReadOnlyList<string> ReadProductMappingTargets(string? featureBindings) {
        if (string.IsNullOrWhiteSpace(featureBindings))
            return [];

        try {
            using var document = JsonDocument.Parse(featureBindings);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
                return [];

            var targets = new List<string>();
            foreach (var binding in document.RootElement.EnumerateArray()) {
                if (binding.ValueKind != JsonValueKind.Object ||
                    !TryGetString(binding, "featureType", out var featureType) ||
                    !string.Equals(featureType, nameof(ElectronicProduct), StringComparison.OrdinalIgnoreCase) ||
                    !TryGetProperty(binding, "association", out var association) ||
                    association.ValueKind != JsonValueKind.Object ||
                    !TryGetString(association, "code", out var associationCode) ||
                    !string.Equals(associationCode, "ProductMapping", StringComparison.OrdinalIgnoreCase) ||
                    !TryGetString(binding, "featureId", out var featureId) ||
                    string.IsNullOrWhiteSpace(featureId)) {
                    continue;
                }

                targets.Add(NormalizeFeatureId(featureId));
            }
            return targets;
        }
        catch (JsonException) {
            return [];
        }
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string value) {
        value = string.Empty;
        if (!TryGetProperty(element, propertyName, out var property) || property.ValueKind != JsonValueKind.String)
            return false;
        value = property.GetString() ?? string.Empty;
        return true;
    }

    private static bool TryGetProperty(JsonElement element, string propertyName, out JsonElement value) {
        foreach (var property in element.EnumerateObject()) {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase)) {
                value = property.Value;
                return true;
            }
        }
        value = default;
        return false;
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
