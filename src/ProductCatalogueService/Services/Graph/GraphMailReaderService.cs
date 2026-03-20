using Microsoft.Extensions.Options;
using Microsoft.Graph;
using Microsoft.Graph.Models;
using ProductCatalogueService.Models;

namespace ProductCatalogueService.Services.Graph;

public interface IGraphMailReaderService
{
    Task<IReadOnlyList<ImportedMailMessage>> ReadMessagesFromAllFoldersAsync(
        DateTimeOffset fromUtc,
        DateTimeOffset toUtc,
        CancellationToken cancellationToken = default);
}

public sealed class GraphMailReaderService : IGraphMailReaderService
{
    private readonly GraphServiceClient _graphClient;
    private readonly GraphAuthOptions _options;
    private readonly ILogger<GraphMailReaderService> _logger;

    public GraphMailReaderService(
        IGraphClientFactory graphClientFactory,
        IOptions<GraphAuthOptions> options,
        ILogger<GraphMailReaderService> logger) {
        _graphClient = graphClientFactory.CreateClient();
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyList<ImportedMailMessage>> ReadMessagesFromAllFoldersAsync(
        DateTimeOffset fromUtc,
        DateTimeOffset toUtc,
        CancellationToken cancellationToken = default) {
        var mailboxUserId = _options.SharedMailboxUserId;
        var folders = await GetAllFoldersAsync(mailboxUserId, cancellationToken);

        var results = new List<ImportedMailMessage>();

        foreach (var folder in folders) {
            cancellationToken.ThrowIfCancellationRequested();

            if (string.IsNullOrWhiteSpace(folder.Id)) {
                continue;
            }

            _logger.LogInformation(
                "Scanning Graph folder '{FolderDisplayName}' ({FolderId}).",
                folder.DisplayName,
                folder.Id);

            var messages = await GetMessagesFromFolderAsync(
                mailboxUserId,
                folder.Id,
                fromUtc,
                toUtc,
                cancellationToken);

            results.AddRange(messages);
        }

        return results;
    }

    private async Task<List<MailFolder>> GetAllFoldersAsync(
        string mailboxUserId,
        CancellationToken cancellationToken) {
        var allFolders = new List<MailFolder>();
        var queue = new Queue<string>();
        queue.Enqueue("msgfolderroot");

        while (queue.Count > 0) {
            cancellationToken.ThrowIfCancellationRequested();

            var parentFolderId = queue.Dequeue();
            var page = await _graphClient.Users[mailboxUserId].MailFolders[parentFolderId].ChildFolders.GetAsync(
                requestConfiguration => {
                    requestConfiguration.QueryParameters.Top = _options.PageSize;
                    requestConfiguration.QueryParameters.Select = ["id", "displayName"];
                    requestConfiguration.QueryParameters.IncludeHiddenFolders = true;
                },
                cancellationToken);

            while (page is not null) {
                if (page.Value is not null) {
                    foreach (var folder in page.Value) {
                        if (string.IsNullOrWhiteSpace(folder.Id)) {
                            continue;
                        }

                        allFolders.Add(folder);
                        queue.Enqueue(folder.Id);
                    }
                }

                if (string.IsNullOrWhiteSpace(page.OdataNextLink)) {
                    break;
                }

                page = await _graphClient.Users[mailboxUserId].MailFolders[parentFolderId].ChildFolders
                    .WithUrl(page.OdataNextLink)
                    .GetAsync(cancellationToken: cancellationToken);
            }
        }

        return allFolders;
    }

    private async Task<List<ImportedMailMessage>> GetMessagesFromFolderAsync(
        string mailboxUserId,
        string mailFolderId,
        DateTimeOffset fromUtc,
        DateTimeOffset toUtc,
        CancellationToken cancellationToken) {
        var result = new List<ImportedMailMessage>();

        var filter =
            $"receivedDateTime ge {fromUtc.UtcDateTime:yyyy-MM-ddTHH:mm:ssZ} and receivedDateTime le {toUtc.UtcDateTime:yyyy-MM-ddTHH:mm:ssZ}";

        var page = await _graphClient.Users[mailboxUserId].MailFolders[mailFolderId].Messages.GetAsync(
            requestConfiguration => {
                requestConfiguration.QueryParameters.Top = _options.PageSize;
                requestConfiguration.QueryParameters.Filter = filter;
                requestConfiguration.QueryParameters.Select =
                [
                    "id",
                    "subject",
                    "body",
                    "bodyPreview",
                    "receivedDateTime",
                    "hasAttachments"
                ];
                requestConfiguration.Headers.Add("Prefer", "outlook.body-content-type=\"text\"");
            },
            cancellationToken);

        while (page is not null) {
            if (page.Value is not null) {
                foreach (var message in page.Value) {
                    cancellationToken.ThrowIfCancellationRequested();

                    var attachments = await GetAttachmentsAsync(
                        mailboxUserId,
                        message.Id,
                        cancellationToken);

                    result.Add(new ImportedMailMessage(
                        FilePath: $"graph://{mailboxUserId}/{mailFolderId}/{message.Id}",
                        Subject: message.Subject?.Trim() ?? string.Empty,
                        Body: NormalizeBody(message.Body?.Content ?? message.BodyPreview ?? string.Empty),
                        Attachments: attachments));
                }
            }

            if (string.IsNullOrWhiteSpace(page.OdataNextLink)) {
                break;
            }

            page = await _graphClient.Users[mailboxUserId].MailFolders[mailFolderId].Messages
                .WithUrl(page.OdataNextLink)
                .GetAsync(
                    requestConfiguration => {
                        requestConfiguration.Headers.Add("Prefer", "outlook.body-content-type=\"text\"");
                    },
                    cancellationToken);
        }

        return result;
    }

    private async Task<IReadOnlyList<ImportedMailAttachment>> GetAttachmentsAsync(
        string mailboxUserId,
        string? messageId,
        CancellationToken cancellationToken) {
        if (string.IsNullOrWhiteSpace(messageId)) {
            return [];
        }

        var result = new List<ImportedMailAttachment>();

        var page = await _graphClient.Users[mailboxUserId].Messages[messageId].Attachments.GetAsync(
            requestConfiguration => {
                requestConfiguration.QueryParameters.Top = _options.PageSize;
            },
            cancellationToken);

        while (page is not null) {
            if (page.Value is not null) {
                foreach (var attachment in page.Value) {
                    switch (attachment) {
                        case FileAttachment fileAttachment:
                            result.Add(new ImportedMailAttachment(
                                FileName: string.IsNullOrWhiteSpace(fileAttachment.Name) ? "attachment.bin" : fileAttachment.Name,
                                ContentType: fileAttachment.ContentType,
                                Size: fileAttachment.Size ?? 0,
                                IsInline: fileAttachment.IsInline ?? false,
                                IsEmbeddedMessage: false,
                                Content: fileAttachment.ContentBytes,
                                EmbeddedMessageSubject: null));
                            break;

                        case ItemAttachment itemAttachment:
                            result.Add(new ImportedMailAttachment(
                                FileName: string.IsNullOrWhiteSpace(itemAttachment.Name) ? "embedded-message.msg" : itemAttachment.Name,
                                ContentType: itemAttachment.ContentType,
                                Size: itemAttachment.Size ?? 0,
                                IsInline: itemAttachment.IsInline ?? false,
                                IsEmbeddedMessage: true,
                                Content: null,
                                EmbeddedMessageSubject: itemAttachment.Name));
                            break;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(page.OdataNextLink)) {
                break;
            }

            page = await _graphClient.Users[mailboxUserId].Messages[messageId].Attachments
                .WithUrl(page.OdataNextLink)
                .GetAsync(cancellationToken: cancellationToken);
        }

        return result;
    }

    private static string NormalizeBody(string body) {
        if (string.IsNullOrWhiteSpace(body)) {
            return string.Empty;
        }

        body = body.Replace("\r\n", "\n", StringComparison.Ordinal)
                   .Replace('\r', '\n');

        return body.Trim();
    }
}