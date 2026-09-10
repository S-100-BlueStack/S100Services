namespace ProductCatalogueAPI.Services.Export
{
    public static class S100CompilerContract
    {
        public const string UnavailableCode = "S100_COMPILER_UNAVAILABLE";
        public const string UnavailableMessage = "S-101 Edition export is unavailable because the configured compiler executable is not available.";
    }

    public sealed class S100CompilerPrerequisiteException()
        : InvalidOperationException(S100CompilerContract.UnavailableMessage)
    {
        public string Code { get; } = S100CompilerContract.UnavailableCode;
    }

    internal static class S100CompilerConfiguration
    {
        public const string SectionName = "S100Compiler";
        public const string ExecutablePathKey = SectionName + ":ExecutablePath";
        public const string CompatibilityDefaultExecutablePath = @"C:\Program Files\s100compiler\s100compiler.exe";

        public static string ResolveExecutablePath(IConfiguration configuration) {
            ArgumentNullException.ThrowIfNull(configuration);
            return configuration[ExecutablePathKey] ?? CompatibilityDefaultExecutablePath;
        }
    }
}
