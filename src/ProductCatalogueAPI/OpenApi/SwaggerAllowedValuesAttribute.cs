namespace ProductCatalogueAPI.OpenApi;

[AttributeUsage(AttributeTargets.Parameter)]
public sealed class SwaggerAllowedValuesAttribute : Attribute
{
    public SwaggerAllowedValuesAttribute(params string[] values) {
        Values = values;
    }

    public IReadOnlyList<string> Values { get; }
}
