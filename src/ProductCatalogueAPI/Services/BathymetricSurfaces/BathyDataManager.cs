using ArcGIS.Core.Data;
using ArcGIS.Core.SystemCore;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Services.BathymetricSurfaces;

/// <summary>Identifies a read-only bathymetric feature service configured in the worker environment.</summary>
internal enum BathymetricSource
{
    /// <summary>Source containing bathymetric constraints.</summary>
    Constraints,
    /// <summary>Source containing deconflicted survey features.</summary>
    DeconflictedSurveys
}

/// <summary>Opens the configured bathymetric feature services for direct ArcGIS access.</summary>
internal interface IBathyDataManager
{
    /// <summary>Runs synchronous ArcGIS work on the STA thread that owns the source geodatabases.</summary>
    /// <param name="work">Open, query and dispose the geodatabases and their datasets inside this callback. Use a synchronous delegate and keep live ArcGIS data objects inside it.</param>
    /// <param name="token">Cancels queued work. Check it inside long-running reads.</param>
    /// <returns>A task that completes when the callback and its Portal sign-in scope have finished.</returns>
    Task RunOnStaAsync(Action work, CancellationToken token);

    /// <summary>Opens the selected feature service inside a <see cref="RunOnStaAsync"/> callback.</summary>
    /// <param name="source">Configured bathymetric feature service to open.</param>
    /// <returns>An open geodatabase owned by the caller. Dispose it on the same STA thread.</returns>
    /// <exception cref="InvalidOperationException">Called outside the STA callback, or the source could not be configured, authenticated or opened.</exception>
    Geodatabase OpenFeatureService(BathymetricSource source);
}

/// <summary>Opens federated feature services after the worker initializes CoreHost.</summary>
internal sealed class BathyDataManager : IBathyDataManager, IDisposable
{
    private readonly SingleThreadTaskScheduler _scheduler = new("Bathymetric source feature services");
    private bool _signOnHandlerInstalled;

    /// <inheritdoc/>
    public Task RunOnStaAsync(Action work, CancellationToken token) =>
        Task.Factory.StartNew(() => {
            token.ThrowIfCancellationRequested();
            try {
                work();
            }
            finally {
                if (_signOnHandlerInstalled) {
                    _signOnHandlerInstalled = false;
                    ArcGISSignOn.Instance.SetSignonHandler(null);
                }
            }
        }, token, TaskCreationOptions.DenyChildAttach, _scheduler);

    /// <inheritdoc/>
    public Geodatabase OpenFeatureService(BathymetricSource source) {
        if (TaskScheduler.Current != _scheduler)
            throw new InvalidOperationException("Open the bathymetric feature service inside RunOnStaAsync.");

        var urlVariable = source switch {
            BathymetricSource.Constraints => "S102ConstraintConnection",
            BathymetricSource.DeconflictedSurveys => "S102DeconflictedSurveyConnection",
            _ => throw new ArgumentOutOfRangeException(nameof(source))
        };
        var service = ReadUrl(source, urlVariable);
        if (!service.AbsolutePath.TrimEnd('/').EndsWith("/FeatureServer", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Bathymetric source {source} requires the FeatureServer root in '{urlVariable}'.");

        var portal = ReadUrl(source, "arcgis_portal_url");
        var credentials = ReadCredential(source, "arcgis_portal_user");
        var parts = credentials.Split("::", 2, StringSplitOptions.None);

        if (parts.Length != 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1]))
            throw new InvalidOperationException($"Bathymetric source {source} requires 'arcgis_portal_user' in username::password format after decryption.");

        var handler = new PortalSignOnHandler(portal, parts[0], parts[1]);

        try {
            // CoreHost requests credentials on demand, including during reads after the geodatabase has opened.
            ArcGISSignOn.Instance.SetSignonHandler(handler);
            _signOnHandlerInstalled = true;
            return new Geodatabase(new ServiceConnectionProperties(service));
        }
        catch (Exception error) when (error is not OperationCanceledException) {
            var operation = handler.SignInFailed ? "Portal sign-in" : "feature service open";
            throw new InvalidOperationException($"Bathymetric source {source}: {operation} failed.");
        }
    }

    /// <summary>Validates a source URL without exposing its value in errors.</summary>
    /// <param name="source">Source to identify in an error.</param>
    /// <param name="variable">Worker environment variable containing the URL.</param>
    /// <returns>An HTTPS URL without user information, query or fragment.</returns>
    private static Uri ReadUrl(BathymetricSource source, string variable) {
        if (Uri.TryCreate(Environment.GetEnvironmentVariable(variable), UriKind.Absolute, out var uri)
            && uri.Scheme == Uri.UriSchemeHttps && uri.UserInfo.Length == 0 && uri.Query.Length == 0 && uri.Fragment.Length == 0)
            return uri;

        throw new InvalidOperationException($"Bathymetric source {source} requires an HTTPS URL without credentials, a query or a fragment in '{variable}'.");
    }

    /// <summary>Decrypts one worker environment variable for Portal sign-in.</summary>
    /// <param name="source">Source to identify in an error.</param>
    /// <param name="variable">Worker environment variable containing the encrypted value.</param>
    /// <returns>The decrypted credential for use by the challenge handler.</returns>
    private static string ReadCredential(BathymetricSource source, string variable) {
        var encrypted = Environment.GetEnvironmentVariable(variable);
        if (!string.IsNullOrWhiteSpace(encrypted)) {
            try {
                var value = Configuration.DecryptString(encrypted);
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }
            catch (Exception) {
                // The decryption exception may contain configuration details.
            }
        }

        throw new InvalidOperationException($"Bathymetric source {source} could not read the encrypted credential in '{variable}'.");
    }

    /// <summary>Drains the manager's ArcGIS lane after the worker stops using it.</summary>
    public void Dispose() => _scheduler.Dispose();

    /// <summary>Answers CoreHost challenges only for the explicitly configured Portal.</summary>
    /// <param name="portal">Allowed Portal origin and path.</param>
    /// <param name="user">Decrypted Portal account.</param>
    /// <param name="password">Decrypted Portal password.</param>
    private sealed class PortalSignOnHandler(Uri portal, string user, string password) : ISignOnHandler
    {
        /// <summary>Indicates that a challenge failed and the visible error should identify sign-in.</summary>
        public bool SignInFailed { get; private set; }

        /// <summary>Authenticates for the configured Portal and keeps credentials and tokens in CoreHost.</summary>
        /// <param name="info">ArcGIS challenge containing the requested Portal URL.</param>
        public void GenerateCredentials(ref SIGNONHANDLERINFO info) {
            SignInFailed = true;
            if (!Uri.TryCreate(info.agoURL, UriKind.Absolute, out var requested)
                || requested.UserInfo.Length != 0 || requested.Query.Length != 0 || requested.Fragment.Length != 0
                || !string.Equals(portal.GetLeftPart(UriPartial.Path).TrimEnd('/'), requested.GetLeftPart(UriPartial.Path).TrimEnd('/'), StringComparison.Ordinal))
                return;

            try {
                SignInFailed = !ArcGISSignOn.Instance.SignInWithCredentials(requested, user, password, out _, out _);
            }
            catch (Exception) {
                // CoreHost handles the failed challenge and the caller reports a sanitized error.
            }
        }
    }
}
