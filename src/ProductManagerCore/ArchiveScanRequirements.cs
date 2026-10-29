namespace S100FC.ProductCatalogue;

/// <summary>Rejects incomplete source archives before any DPC scan result is returned.</summary>
internal static class ArchiveScanRequirements
{
    /// <summary>The spatial source classes required to compare both endpoints of every edit.</summary>
    internal static readonly string[] Classes = ["point", "pointset", "curve", "surface"];

    /// <summary>Fails closed with a safe connection label and class name, without exposing connection contents.</summary>
    /// <param name="connectionLabel">The connection filename, never its contents or credentials.</param>
    /// <param name="className">The required spatial source class.</param>
    /// <param name="archiveEnabled">Whether the opened class exposes its archive.</param>
    /// <exception cref="InvalidOperationException">The scan cannot safely compare all source classes.</exception>
    internal static void Verify(string connectionLabel, string className, bool archiveEnabled) {
        if (!archiveEnabled)
            throw new InvalidOperationException($"DPC archive scan is incomplete: connection '{connectionLabel}', class '{className}' is not archive enabled. The watermark and candidates were preserved.");
    }
}
