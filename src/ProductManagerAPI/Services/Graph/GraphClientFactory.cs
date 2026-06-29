using Azure.Core;
using Azure.Identity;
using Microsoft.Extensions.Options;
using Microsoft.Graph;

namespace ProductManagerAPI.Services.Graph;

public interface IGraphClientFactory
{
    GraphServiceClient CreateClient();
}

public sealed class GraphClientFactory : IGraphClientFactory
{
    private readonly GraphAuthOptions _options;
    private readonly ILogger<GraphClientFactory> _logger;

    public GraphClientFactory(
        IOptions<GraphAuthOptions> options,
        ILogger<GraphClientFactory> logger) {
        _options = options.Value;
        _logger = logger;
    }

    public GraphServiceClient CreateClient() {
        ValidateOptions(_options);

        return _options.AuthenticationMode switch {
            GraphAuthenticationMode.DeviceCode => CreateDelegatedClient(_options),
            GraphAuthenticationMode.ClientSecret => CreateAppOnlyClient(_options),
            _ => throw new InvalidOperationException(
                $"Unsupported authentication mode: {_options.AuthenticationMode}")
        };
    }

    private GraphServiceClient CreateDelegatedClient(GraphAuthOptions options) {
        var credential = new DeviceCodeCredential(
            new DeviceCodeCredentialOptions {
                TenantId = options.TenantId,
                ClientId = options.ClientId,
                DeviceCodeCallback = (deviceCodeInfo, cancellationToken) => {
                    _logger.LogInformation(
                        "Authenticate to Microsoft Graph. Open {VerificationUri} and enter code {UserCode}. Expires at {ExpiresOn}.",
                        deviceCodeInfo.VerificationUri,
                        deviceCodeInfo.UserCode,
                        deviceCodeInfo.ExpiresOn);

                    return Task.CompletedTask;
                }
            });

        return new GraphServiceClient(credential, options.DelegatedScopes);
    }

    private GraphServiceClient CreateAppOnlyClient(GraphAuthOptions options) {
        if (string.IsNullOrWhiteSpace(options.ClientSecret)) {
            throw new InvalidOperationException(
                "Graph:ClientSecret must be configured when AuthenticationMode is ClientSecret.");
        }

        var credential = new ClientSecretCredential(
            options.TenantId,
            options.ClientId,
            options.ClientSecret);

        return new GraphServiceClient(
            credential,
            ["https://graph.microsoft.com/.default"]);
    }

    private static void ValidateOptions(GraphAuthOptions options) {
        if (string.IsNullOrWhiteSpace(options.TenantId)) {
            throw new InvalidOperationException("Graph:TenantId is required.");
        }

        if (string.IsNullOrWhiteSpace(options.ClientId)) {
            throw new InvalidOperationException("Graph:ClientId is required.");
        }

        if (string.IsNullOrWhiteSpace(options.SharedMailboxUserId)) {
            throw new InvalidOperationException("Graph:SharedMailboxUserId is required.");
        }

        if (options.PageSize <= 0) {
            throw new InvalidOperationException("Graph:PageSize must be greater than zero.");
        }
    }
}