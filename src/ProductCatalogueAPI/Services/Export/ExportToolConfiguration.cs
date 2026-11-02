namespace ProductCatalogueAPI.Services.Export;

/// <summary>Resolves S-57 pipeline executable paths from the same configuration providers as the S-101 compiler.</summary>
internal static class ExportToolConfiguration
{
    /// <summary>The S-101 to S-57 mapper executable setting.</summary>
    internal const string MapperExecutablePathKey = "S100Mapper:ExecutablePath";
    /// <summary>The S-57 compiler executable setting.</summary>
    internal const string S57ExecutablePathKey = "S57Compiler:ExecutablePath";
    /// <summary>Preserves the mapper installation path when no setting is supplied.</summary>
    internal const string DefaultMapperExecutablePath = @"C:\Program Files\s100mapper\s100mapper.exe";
    /// <summary>Preserves the S-57 compiler installation path when no setting is supplied.</summary>
    internal const string DefaultS57ExecutablePath = @"C:\Program Files\s57compiler\s57compiler.exe";

    /// <summary>Reads the mapper setting, retaining an explicitly blank value for normal executable validation.</summary>
    /// <param name="configuration">The Worker's effective configuration, including environment overrides.</param>
    /// <returns>The configured path or the existing installation default.</returns>
    internal static string ResolveMapperExecutablePath(IConfiguration configuration) =>
        configuration[MapperExecutablePathKey] ?? DefaultMapperExecutablePath;

    /// <summary>Reads the S-57 compiler setting without overriding an explicitly blank value.</summary>
    /// <param name="configuration">The Worker's effective configuration, including environment overrides.</param>
    /// <returns>The configured path or the existing installation default.</returns>
    internal static string ResolveS57ExecutablePath(IConfiguration configuration) =>
        configuration[S57ExecutablePathKey] ?? DefaultS57ExecutablePath;
}
