namespace ProductCatalogueAPI.Options;

/// <summary>Bounds upload and expansion memory for externally generated bathymetric exchange sets.</summary>
internal static class BathymetricUploadLimits
{
    /// <summary>Maximum compressed exchange-set bytes submitted in one completion.</summary>
    public const int ExchangeSetBytes = 64 * 1024 * 1024;
    /// <summary>Maximum bytes for an optional VLD diagnostic.</summary>
    public const int ValidationArtifactBytes = 4 * 1024 * 1024;
    /// <summary>Maximum combined multipart request size, including form overhead.</summary>
    public const int RequestBytes = ExchangeSetBytes + ValidationArtifactBytes + 1024 * 1024;
}
