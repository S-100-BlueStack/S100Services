namespace S100FC.ProductCatalogue;

/// <summary>
/// Applies candidate version metadata that is safe for the installed S-100 compiler.
/// </summary>
internal static class ExportSnapshotVersioning
{
    /// <summary>
    /// Sets the candidate edition while keeping the YAML update field absent.
    /// </summary>
    /// <param name="dataset">The in-memory export snapshot.</param>
    /// <param name="edition">The SQL-authoritative candidate edition.</param>
    /// <exception cref="ArgumentNullException">Thrown when <paramref name="dataset"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">Thrown when <paramref name="edition"/> is negative.</exception>
    internal static void ApplyCompilerCompatibleVersion(YAML.Dataset dataset, int edition) {
        ArgumentNullException.ThrowIfNull(dataset);
        if (edition < 0)
            throw new ArgumentOutOfRangeException(nameof(edition));

        dataset.Edition = checked((uint)edition);

        // The installed s100compiler fails when Update is serialized, including Update: 0.
        // Candidate update numbers remain authoritative in SQL and compiler filenames instead.
        dataset.Update = null;
    }
}
