namespace S100FC.ProductCatalogue;

/// <summary>Rejects incomplete source archives before any DPC scan result is returned.</summary>
internal static class ArchiveScanRequirements
{
    /// <summary>The geometry-bearing source classes used to resolve product membership.</summary>
    internal static readonly string[] SpatialClasses = ["point", "pointset", "curve", "surface"];
    /// <summary>The associated source tables whose membership comes from incoming spatial bindings.</summary>
    internal static readonly string[] NonSpatialClasses = ["featuretype", "informationtype"];
    /// <summary>Every source class must have a complete archive before DPC returns any changes.</summary>
    internal static readonly string[] Classes = [.. SpatialClasses, .. NonSpatialClasses];

    /// <summary>Fails closed with a safe connection label and class name, without exposing connection contents.</summary>
    /// <param name="connectionLabel">The connection filename, never its contents or credentials.</param>
    /// <param name="className">The required source class or table.</param>
    /// <param name="archiveEnabled">Whether the opened class exposes its archive.</param>
    /// <exception cref="InvalidOperationException">The scan cannot safely compare all source classes.</exception>
    internal static void Verify(string connectionLabel, string className, bool archiveEnabled) {
        if (!archiveEnabled)
            throw new InvalidOperationException($"DPC archive scan is incomplete: connection '{connectionLabel}', class '{className}' is not archive enabled. The watermark and candidates were preserved.");
    }
}
