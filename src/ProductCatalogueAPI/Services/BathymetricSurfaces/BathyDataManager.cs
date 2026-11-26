using System.Globalization;
using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
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

/// <summary>A bathymetric AOI read from the S-128 feature service.</summary>
/// <param name="Geometry">The feature geometry in the spatial reference returned by the service.</param>
/// <param name="AttributeBindings">The full attributeBindings field as stored in the service.</param>
internal sealed record BathymetricAoi(Geometry Geometry, string AttributeBindings);

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

    /// <summary>Reads S-128 AOIs whose attribute bindings contain the S-102 marker. Runs on its own STA</summary>
    /// <param name="token">Cancels queued work and stops the cursor scan between rows.</param>
    /// <returns>Geometries and complete attribute bindings from the layer configured in S128AoiConnection.</returns>
    Task<IReadOnlyList<BathymetricAoi>> ReadBathymetricAoisAsync(CancellationToken token);
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
        var service = ReadUrl(source.ToString(), urlVariable);
        if (!service.AbsolutePath.TrimEnd('/').EndsWith("/FeatureServer", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Bathymetric source {source} requires the FeatureServer root in '{urlVariable}'.");

        return OpenFeatureService(source.ToString(), service);
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyList<BathymetricAoi>> ReadBathymetricAoisAsync(CancellationToken token) {
        const string source = "S-128 AOIs";
        const string variable = "S128AoiConnection";
        const string bindingsField = "attributeBindings";
        var aois = new List<BathymetricAoi>();

        await RunOnStaAsync(() => {
            var layerUrl = ReadUrl(source, variable);
            var path = layerUrl.AbsolutePath.TrimEnd('/');
            var separator = path.LastIndexOf('/');
            if (separator < 0 || !path[..separator].EndsWith("/FeatureServer", StringComparison.OrdinalIgnoreCase)
                || !int.TryParse(path.AsSpan(separator + 1), NumberStyles.None, CultureInfo.InvariantCulture, out var layerId))
                throw new InvalidOperationException($"'{variable}' must point to a numeric layer under /FeatureServer.");

            // The ArcGIS connector uses the service root; the feature class is selected by layer ID.
            var serviceUrl = new Uri(layerUrl.GetLeftPart(UriPartial.Authority) + path[..separator]);
            using var geodatabase = OpenFeatureService(source, serviceUrl);
            using var featureClass = geodatabase.OpenDataset<FeatureClass>(layerId.ToString(CultureInfo.InvariantCulture));
            using var definition = featureClass.GetDefinition();
            if (definition.FindField(bindingsField) < 0)
                throw new InvalidOperationException($"The layer configured in '{variable}' must expose '{bindingsField}'.");

            using var cursor = featureClass.Search(new QueryFilter {
                WhereClause = "attributeBindings LIKE '%S-102%'",
                SubFields = $"{definition.GetObjectIDField()}, {bindingsField}, {definition.GetShapeField()}"
            }, true);

            while (true) {
                token.ThrowIfCancellationRequested();
                if (!cursor.MoveNext())
                    break;

                using var feature = (Feature)cursor.Current;
                if (feature[bindingsField] is string bindings && feature.GetShape() is { IsEmpty: false } shape)
                    aois.Add(new BathymetricAoi(shape.Clone(), bindings));
            }
        }, token);

        return aois;
    }

    /// <summary>Opens the service root and registers its Portal challenge handler for the current STA callback.</summary>
    /// <param name="source">Source label used in configuration and connection errors.</param>
    /// <param name="service">Validated root URL of the feature service.</param>
    /// <returns>The open geodatabase, owned by the caller on the ArcGIS thread.</returns>
    private Geodatabase OpenFeatureService(string source, Uri service) {
        var portal = ReadUrl(source, "arcgis_portal_url");
        var credentials = ReadCredential(source, "arcgis_portal_user");
        var parts = credentials.Split("::", 2, StringSplitOptions.None);

        if (parts.Length != 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1]))
            throw new InvalidOperationException($"Bathymetric source {source} requires 'arcgis_portal_user' in username::password format.");

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
    private static Uri ReadUrl(string source, string variable) {
        if (Uri.TryCreate(Environment.GetEnvironmentVariable(variable), UriKind.Absolute, out var uri)
            && uri.Scheme == Uri.UriSchemeHttps && uri.UserInfo.Length == 0 && uri.Query.Length == 0 && uri.Fragment.Length == 0)
            return uri;

        throw new InvalidOperationException($"Bathymetric source {source} requires an HTTPS URL without credentials, a query or a fragment in '{variable}'.");
    }

    /// <summary>Reads the Portal credentials from a worker environment variable.</summary>
    /// <param name="source">Bathymetric source to identify if the variable is missing.</param>
    /// <param name="variable">Environment variable containing the credentials in username::password format.</param>
    /// <returns>The credential pair exactly as configured.</returns>
    /// <exception cref="InvalidOperationException">The variable is missing or blank.</exception>
    private static string ReadCredential(string source, string variable) {
        var credentials = Environment.GetEnvironmentVariable(variable);
        if (string.IsNullOrWhiteSpace(credentials))
            throw new InvalidOperationException($"Bathymetric source {source} requires the environment variable '{variable}'.");

        return credentials;
    }

    /// <summary>Drains the manager's ArcGIS lane after the worker stops using it.</summary>
    public void Dispose() => _scheduler.Dispose();

    /// <summary>Answers CoreHost challenges only for the explicitly configured Portal.</summary>
    /// <param name="portal">Allowed Portal origin and path.</param>
    /// <param name="user">Portal account.</param>
    /// <param name="password">Portal password.</param>
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
