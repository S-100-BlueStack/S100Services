namespace S100FC.ProductCatalogue;

/// <summary>
/// Indicates that one or more archive rows could not be spatially classified for product change detection.
/// </summary>
/// <param name="connectionName">The geodatabase connection whose rows were not classified.</param>
/// <param name="rowCount">The number of archive rows that could not be classified.</param>
public sealed class ArchiveChangeClassificationException(string connectionName, int rowCount)
    : InvalidOperationException($"{rowCount} archive change row(s) could not be classified for connection '{connectionName}'.")
{
    /// <summary>Gets the geodatabase connection whose rows were not classified.</summary>
    public string ConnectionName { get; } = connectionName;

    /// <summary>Gets the number of archive rows that could not be classified.</summary>
    public int RowCount { get; } = rowCount;
}
