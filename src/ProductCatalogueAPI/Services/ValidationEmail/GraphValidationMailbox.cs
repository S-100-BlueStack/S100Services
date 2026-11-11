using Microsoft.Extensions.Options;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>Graph v1.0 with certificate client assertions, immutable IDs, bounded bodies and Retry-After handling.</summary>
public sealed class GraphValidationMailbox(IHttpClientFactory clients, IOptions<ValidationEmailOptions> options, TimeProvider clock, IValidationEmailParser parser) : IValidationMailbox, IDisposable
{
    private readonly SemaphoreSlim tokenGate = new(1, 1);
    private string? accessToken;
    private DateTimeOffset tokenExpires;
    private ValidationEmailOptions Settings => options.Value;
    private string FolderPath => $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(Settings.Mailbox)}/mailFolders/{Uri.EscapeDataString(Settings.Folder)}/messages/delta";
    private string MessagePath(string id) => $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(Settings.Mailbox)}/messages/{Uri.EscapeDataString(id)}";

    /// <inheritdoc/>
    public async Task<ValidationMailboxPage> ReadPageAsync(string? cursor, DateTimeOffset initialFrom, CancellationToken cancellationToken) {
        var url = cursor ?? FolderPath + "?$select=id&$filter=" + Uri.EscapeDataString("receivedDateTime ge " + initialFrom.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));
        if (!url.StartsWith(FolderPath + "?", StringComparison.OrdinalIgnoreCase) || url.Length > 16384) throw new InvalidDataException("INVALID_DELTA_CURSOR");
        using var page = await GetAsync(url, 2 * 1024 * 1024, cancellationToken);
        var ids = page.RootElement.GetProperty("value").EnumerateArray().Where(m => !m.TryGetProperty("@removed", out _)).Select(m => m.GetProperty("id").GetString()!).ToArray();
        var complete = !page.RootElement.TryGetProperty("@odata.nextLink", out var next);
        var link = complete ? page.RootElement.GetProperty("@odata.deltaLink").GetString() : next.GetString();
        if (link is null || !link.StartsWith(FolderPath + "?", StringComparison.OrdinalIgnoreCase) || link.Length > 16384) throw new InvalidDataException("INVALID_DELTA_LINK");
        return new(ids, link, complete);
    }

    /// <inheritdoc/>
    public async Task<ValidationEmailMessage> ReadMessageAsync(string id, CancellationToken cancellationToken) {
        using var document = await GetAsync(MessagePath(id) + "?$select=id,internetMessageId,from,sender,receivedDateTime,subject,body,internetMessageHeaders,hasAttachments", 2 * 1024 * 1024, cancellationToken);
        var message = document.RootElement;
        var subject = message.GetProperty("subject").GetString() ?? "";
        var sender = Address(message, "from");
        var transportSender = Address(message, "sender");
        var originalHeaders = message.TryGetProperty("internetMessageHeaders", out var headers) ? headers.EnumerateArray().Select(h =>
            new KeyValuePair<string, string>(h.GetProperty("name").GetString() ?? "", h.GetProperty("value").GetString() ?? "")).ToArray() : [];
        var trusted = ValidationEmailSenderTrust.IsTrusted(sender, transportSender, originalHeaders, Settings);
        var attachments = new List<ValidationEmailAttachment>();
        string? retrievalProblem = null;
        // Irrelevant correspondence is not downloaded or persisted by the polling job.
        if (parser.IsRelevantSubject(subject)) {
            string? link = MessagePath(id) + "/attachments?$select=id,name,size,isInline&$top=50";
            var pages = 0;
            while (link is not null) {
                if (++pages > 10 || !link.StartsWith(MessagePath(id) + "/attachments?", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("ATTACHMENT_PAGINATION_LIMIT");
                using var list = await GetAsync(link, 1024 * 1024, cancellationToken);
                foreach (var item in list.RootElement.GetProperty("value").EnumerateArray()) {
                    var name = item.GetProperty("name").GetString() ?? "";
                    if (!parser.IsRelevantAttachment(name)) continue;
                    if (attachments.Count >= 16 || item.GetProperty("size").GetInt64() > ValidationEmailLimits.MaxAttachmentBytes || name.Length > 260 ||
                        item.TryGetProperty("@odata.type", out var type) && type.GetString() != "#microsoft.graph.fileAttachment") {
                        retrievalProblem = "UNSUPPORTED_OR_OVERSIZED_ATTACHMENT";
                        continue;
                    }
                    using var content = await GetAsync(MessagePath(id) + "/attachments/" + Uri.EscapeDataString(item.GetProperty("id").GetString()!), 12 * 1024 * 1024, cancellationToken);
                    if (!content.RootElement.TryGetProperty("contentBytes", out var bytes)) { retrievalProblem = "ATTACHMENT_CONTENT_MISSING"; continue; }
                    var data = bytes.GetBytesFromBase64();
                    if (data.Length > ValidationEmailLimits.MaxAttachmentBytes || attachments.Sum(a => (long)a.Content.Length) + data.Length > 16 * 1024 * 1024) {
                        retrievalProblem = "ATTACHMENT_SIZE_LIMIT";
                        continue;
                    }
                    attachments.Add(new(name, data));
                }
                link = list.RootElement.TryGetProperty("@odata.nextLink", out var next) ? next.GetString() : null;
            }
        }
        var body = message.GetProperty("body").GetProperty("content").GetString() ?? "";
        if (subject.Length > 2048 || body.Length > 256 * 1024) { subject = subject[..Math.Min(subject.Length, 2048)]; body = ""; retrievalProblem = "MESSAGE_SIZE_LIMIT"; }
        return new(message.GetProperty("id").GetString()!, message.TryGetProperty("internetMessageId", out var internetId) ? internetId.GetString() : null, sender,
            message.GetProperty("receivedDateTime").GetDateTimeOffset(), subject, body, attachments, trusted, retrievalProblem);
    }

    private static string Address(JsonElement message, string property) => message.TryGetProperty(property, out var node) && node.ValueKind == JsonValueKind.Object && node.TryGetProperty("emailAddress", out var address) && address.TryGetProperty("address", out var value) ? value.GetString() ?? "" : "";

    private async Task<JsonDocument> GetAsync(string url, int limit, CancellationToken cancellationToken) {
        // Every URL is constructed locally or validated under the exact mailbox resource; bearer tokens never follow redirects.
        for (var attempt = 0; ; attempt++) {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenAsync(cancellationToken));
            request.Headers.TryAddWithoutValidation("Prefer", "IdType=\"ImmutableId\", outlook.body-content-type=\"text\", odata.maxpagesize=25");
            using var response = await clients.CreateClient("ValidationGraph").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (response.StatusCode == HttpStatusCode.Gone) throw new ValidationDeltaExpiredException();
            if (response.StatusCode == HttpStatusCode.Unauthorized && attempt == 0) { tokenExpires = DateTimeOffset.MinValue; continue; }
            if ((response.StatusCode == HttpStatusCode.TooManyRequests || (int)response.StatusCode >= 500) && attempt < 3) {
                await RetryAsync(response, attempt, cancellationToken);
                continue;
            }
            if (!response.IsSuccessStatusCode) throw new HttpRequestException("ICENC_GRAPH_REQUEST_FAILED", null, response.StatusCode);
            return await ReadJsonAsync(response, limit, cancellationToken);
        }
    }

    private async Task<string> TokenAsync(CancellationToken cancellationToken) {
        await tokenGate.WaitAsync(cancellationToken);
        try {
            if (accessToken is not null && clock.GetUtcNow() < tokenExpires) return accessToken;
            using var store = new X509Store(StoreName.My, StoreLocation.LocalMachine);
            store.Open(OpenFlags.ReadOnly);
            var certificates = store.Certificates.Find(X509FindType.FindByThumbprint, Settings.CertificateThumbprint.Replace(" ", ""), true);
            try {
                if (certificates.Count != 1 || !certificates[0].HasPrivateKey) throw new InvalidOperationException("ICENC_CERTIFICATE_UNAVAILABLE");
                using var rsa = certificates[0].GetRSAPrivateKey() ?? throw new InvalidOperationException("ICENC_RSA_CERTIFICATE_REQUIRED");
                var endpoint = $"https://login.microsoftonline.com/{Settings.TenantId}/oauth2/v2.0/token";
                var now = clock.GetUtcNow();
                var header = Encode(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, string> { ["alg"] = "PS256", ["typ"] = "JWT", ["x5t#S256"] = Encode(certificates[0].GetCertHash(HashAlgorithmName.SHA256)) }));
                var payload = Encode(JsonSerializer.SerializeToUtf8Bytes(new { aud = endpoint, iss = Settings.ClientId, sub = Settings.ClientId, jti = Guid.NewGuid().ToString("D"), nbf = now.AddSeconds(-30).ToUnixTimeSeconds(), exp = now.AddMinutes(5).ToUnixTimeSeconds() }));
                var unsigned = header + "." + payload;
                var assertion = unsigned + "." + Encode(rsa.SignData(Encoding.ASCII.GetBytes(unsigned), HashAlgorithmName.SHA256, RSASignaturePadding.Pss));
                for (var attempt = 0; ; attempt++) {
                    using var form = new FormUrlEncodedContent(new Dictionary<string, string> { ["client_id"] = Settings.ClientId, ["scope"] = "https://graph.microsoft.com/.default", ["grant_type"] = "client_credentials", ["client_assertion_type"] = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", ["client_assertion"] = assertion });
                    using var response = await clients.CreateClient("ValidationGraph").PostAsync(endpoint, form, cancellationToken);
                    if ((response.StatusCode == HttpStatusCode.TooManyRequests || (int)response.StatusCode >= 500) && attempt < 3) { await RetryAsync(response, attempt, cancellationToken); continue; }
                    if (!response.IsSuccessStatusCode) throw new InvalidOperationException("ICENC_GRAPH_AUTHENTICATION_FAILED");
                    using var token = await ReadJsonAsync(response, 64 * 1024, cancellationToken);
                    accessToken = token.RootElement.GetProperty("access_token").GetString() ?? throw new InvalidDataException("TOKEN_MISSING");
                    tokenExpires = now.AddSeconds(Math.Max(0, token.RootElement.GetProperty("expires_in").GetInt32() - 120));
                    return accessToken;
                }
            }
            finally { foreach (var certificate in certificates) certificate.Dispose(); }
        }
        finally { tokenGate.Release(); }
    }
    private static string Encode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private async Task RetryAsync(HttpResponseMessage response, int attempt, CancellationToken cancellationToken) {
        var delay = response.Headers.RetryAfter?.Delta ?? (response.Headers.RetryAfter?.Date - clock.GetUtcNow()) ?? TimeSpan.FromSeconds(1 << attempt);
        if (delay > TimeSpan.FromSeconds(45)) throw new HttpRequestException("ICENC_GRAPH_LONG_RETRY_AFTER", null, response.StatusCode);
        await Task.Delay(delay < TimeSpan.Zero ? TimeSpan.Zero : delay, cancellationToken);
    }
    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response, int limit, CancellationToken cancellationToken) {
        if (response.Content.Headers.ContentLength > limit) throw new InvalidDataException("GRAPH_RESPONSE_LIMIT");
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[16384];
        int count;
        while ((count = await input.ReadAsync(buffer, cancellationToken)) > 0) {
            if (output.Length + count > limit) throw new InvalidDataException("GRAPH_RESPONSE_LIMIT");
            await output.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
        }
        return JsonDocument.Parse(output.ToArray(), new JsonDocumentOptions { MaxDepth = 32 });
    }

    /// <summary>Releases the token refresh synchronization primitive on host shutdown.</summary>
    public void Dispose() => tokenGate.Dispose();
}
