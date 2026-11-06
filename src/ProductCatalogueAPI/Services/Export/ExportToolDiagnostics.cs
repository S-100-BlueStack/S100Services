namespace ProductCatalogueAPI.Services.Export;

/// <summary>Reports the actual executable selected for each launch without imposing version or age requirements.</summary>
internal static class ExportToolDiagnostics
{
    /// <summary>Logs inherited Java-option availability and executable modification time immediately before launch.</summary>
    /// <param name="logger">The export engine logger carrying its source context.</param>
    /// <param name="executable">The existing executable selected for this invocation.</param>
    /// <param name="datasetName">The export dataset associated with the process.</param>
    internal static void LogBeforeLaunch(ILogger logger, string executable, string datasetName) {
        WarnIfJavaOptionsMissing(logger, Environment.GetEnvironmentVariable("JAVA_TOOL_OPTIONS"), datasetName);
        try {
            var file = new FileInfo(executable);
            logger.LogInformation("Starting export tool. CompilerName: {CompilerName}. ExecutablePath: {ExecutablePath}. LastModifiedUtc: {LastModifiedUtc:O}. DatasetName: {DatasetName}.",
                file.Name, file.FullName, file.LastWriteTimeUtc, datasetName);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or System.Security.SecurityException) {
            // File metadata is diagnostic only; failure to read it must not decide whether the tool runs.
            logger.LogWarning(exception, "Export tool modification time could not be read. ExecutablePath: {ExecutablePath}. DatasetName: {DatasetName}.", executable, datasetName);
        }
    }

    /// <summary>Warns when the process has no Java options without disclosing the variable's contents.</summary>
    /// <param name="logger">The export engine logger.</param>
    /// <param name="javaOptions">The value inherited by the current process; never logged.</param>
    /// <param name="datasetName">The export being prepared.</param>
    internal static void WarnIfJavaOptionsMissing(ILogger logger, string? javaOptions, string datasetName) {
        if (string.IsNullOrWhiteSpace(javaOptions))
            logger.LogWarning("JAVA_TOOL_OPTIONS is not set in this process. DatasetName: {DatasetName}.", datasetName);
    }
}
