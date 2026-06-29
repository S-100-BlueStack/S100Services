using Microsoft.Extensions.Options;
using MsgReader.Outlook;
using ProductManagerAPI.Data.Models;
using ProductManagerAPI.Data.Repositories;
using ProductManagerAPI.Models;
using ProductManagerAPI.Services.MailImport;
using ProductManagerAPI.Services.Graph;
using S100FC.ProductCatalogue;
using Serilog.Data;
using System.Text.RegularExpressions;
using Storage = MsgReader.Outlook.Storage;
namespace ProductManagerAPI.Jobs;

public class ProcessProductStatusEmailsJob(
    IProductManager productManager,
    ILogger<ProcessProductStatusEmailsJob> logger,
    IOptions<MailImportOptions> options,
    IProductStatusEmailParser productStatusEmailParser,
    IProductRepository productRepository) : IBackgroundJob
{
    private readonly ILogger<ProcessProductStatusEmailsJob> _logger = logger;
    private readonly MailImportOptions _options = options.Value;
    private readonly IProductStatusEmailParser _productStatusEmailParser = productStatusEmailParser;
    private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
    private readonly IProductRepository _productRepository = productRepository;
    public async Task RunAsync(CancellationToken cancellationToken) {
        _logger.LogInformation("Job: {jobName} started", nameof(ProcessProductStatusEmailsJob));

        ValidateOptions(_options);

        var files = Directory.EnumerateFiles(
                _options.SourceDirectoryPath,
                _options.SearchPattern,
                _options.IncludeSubdirectories
                    ? SearchOption.AllDirectories
                    : SearchOption.TopDirectoryOnly)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .Take(_options.BatchSize)
            .ToList();

        if (files.Count == 0) {
            _logger.LogInformation(
                "No mail files found in directory '{Directory}' with pattern '{Pattern}'.",
                _options.SourceDirectoryPath,
                _options.SearchPattern);

            return;
        }
        var currentProducts = await this._productRepository.GetCurrentAsync();

        foreach (var filePath in files) {
            cancellationToken.ThrowIfCancellationRequested();
            try {
                var importedMessage = LoadMailMessage(filePath);

                _logger.LogInformation(
                    "Parsed mail '{FilePath}'. Subject '{Subject}'. Attachments: {AttachmentCount}.",
                    importedMessage.FilePath,
                    importedMessage.Subject,
                    importedMessage.Attachments.Count);

                await ProcessImportedMailAsync(importedMessage, currentProducts, cancellationToken);
            }
            catch (Exception ex) {
                _logger.LogError(ex, "Failed to process mail file '{FilePath}'.", filePath);
            }
        }

        // TODO

        // Step 1) Connect to the email. Microsoft.Graph OR Microsoft.Exchange.WebServices.Data.. Skip this step for now and just read from sample emails


        // Step 2) Read content and scan for results. RegEx for keywords in subject/body?


        // Step 3) Post to database with identified status (Failed/Invalid, Success, Awaiting)

        // Appends row to SCD Type2 database 'upsert'
        //await _repository.AppendAsync("101DK0040349E", ProductState.InTransit);


        // Step 4) Save P007 report file somewhere somehow. as byte[] in database perhaps



        _logger.LogInformation("Job: {jobName} finished", nameof(ProcessProductStatusEmailsJob));
    }

    private async Task<Task> ProcessImportedMailAsync(
     ImportedMailMessage mail,
     IEnumerable<ProductRecord>? currentProducts,
     CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();

        var parsedMail = _productStatusEmailParser.Parse(mail);
        if (parsedMail == null) {
            _logger.LogError("Parsed Mail returned null. Skipping mail.");
            return Task.CompletedTask;
        }
        if (!parsedMail.IsRelevant) {
            _logger.LogInformation(
                "Mail '{Subject}' was classified as non-registration mail.",
                parsedMail.OriginalSubject);

            return Task.CompletedTask;
        }

        _logger.LogInformation(
            "Parsed registration mail. Category: {Category}, Outcome: {Outcome}, RegistrationId: {RegistrationId}, RegistrationName: {RegistrationName}, Crc: {Crc}, IsCatalog: {IsCatalog}, Attachment: {AttachmentFileName}",
            parsedMail.Category,
            parsedMail.Outcome,
            parsedMail.RegistrationId,
            parsedMail.RegistrationName,
            parsedMail.Crc,
            parsedMail.IsCatalog,
            parsedMail.DocumentAttachment?.FileName);
        if (!string.IsNullOrEmpty(parsedMail.RegistrationId)) {
            ProductRecord? product = currentProducts?.FirstOrDefault(x => parsedMail.RegistrationId.Contains(x.Name));
            if (product == null) {

                if (!string.IsNullOrWhiteSpace(parsedMail.RegistrationId) &&
                    TryConvertRegistrationId(parsedMail.RegistrationId, out var converted)) {
                    product = currentProducts?.FirstOrDefault(x => converted.Contains(x.Name));
                }
            }
            if (!string.IsNullOrEmpty(parsedMail.RegistrationName)) {
                await HandleProductUpdateFromMail(parsedMail, product, cancellationToken);
            }
            else {
                _logger.LogError("Parsed Mail does not contain a Registration Name. Cannot process.");
            }
        }
        return Task.CompletedTask;
    }

    private async Task<bool> HandleProductUpdateFromMail(ParsedProductStatusEmail parsedMail, ProductRecord? product, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        if (parsedMail == null) { return false; }
        var state = ProductState.Frozen;
        var type = GetRegistrationType(parsedMail.RegistrationId);
        switch (parsedMail.Outcome) { // TODO: Ensure mapping is correct
            case ProductStatusEmailOutcome.Unknown: // Unknown = Information could not be extracted from subject
                state = ProductState.Frozen;
                break;
            case ProductStatusEmailOutcome.Successful: // Successful = Fully accepted registration of new cell
                state = ProductState.Exported;
                break;
            case ProductStatusEmailOutcome.AcceptedForDistribution: // Accepted For Distribution = Fully accepted and awaiting next patch-window
                    state = ProductState.Exported;
                break;
            case ProductStatusEmailOutcome.PassedInHolding: // Passed In Holding = Accepted but missing some information before publishing
                state = ProductState.Frozen;
                break;
            case ProductStatusEmailOutcome.FailureToRegister: // Failure to register = Rejected registration of new cell
                state = ProductState.Rejected;
                break;
        }
        if (parsedMail.RegistrationName != null) {
            if (state != product?.State || product == null) {
                try {
                    _logger.LogInformation("Product {Name} has new state: {newState} from old state: {oldState}. Attempting upsert.", parsedMail.RegistrationName, state, product?.State);
                    await _productRepository.AppendAsync(parsedMail.RegistrationName, state, "S-101", product.EditionNo, product.UpdateNo, null, parsedMail.DocumentAttachment?.Content, parsedMail.DocumentAttachment?.FileName);
                    _logger.LogInformation("Product {Name} successfully upserted with new state {newState}.", parsedMail.RegistrationName, state);
                    return true;
                }
                catch (Exception ex) {
                    _logger.LogError("Failed to upsert {Name} in Product Repository: {Exception}.", parsedMail.RegistrationName, ex);
                    return false;
                }
            }
            else if (state == product.State) {
                _logger.LogInformation("New state is the same as old state for Product {Name}: {newState}. Skipping upsert.", product.Name, state);
                return true;
            }
            else if (product.State == ProductState.Frozen) {
                _logger.LogWarning("Product {Name} is frozen. Skipping upsert to new state {newState}.", product.Name, state);
                return false;
            }
        }
        return true;
    }
    private static ImportedMailMessage LoadMailMessage(string filePath) {
        using var message = new Storage.Message(filePath);

        var subject = message.Subject?.Trim() ?? string.Empty;
        var body = NormalizeBody(GetBestBody(message));
        var attachments = ReadAttachments(message);

        return new ImportedMailMessage(
            FilePath: filePath,
            Subject: subject,
            Body: body,
            Attachments: attachments);
    }
    private static IReadOnlyList<ImportedMailAttachment> ReadAttachments(Storage.Message message) {
        var attachments = new List<ImportedMailAttachment>();

        foreach (var attachment in message.Attachments) {
            switch (attachment) {
                case Storage.Attachment fileAttachment: {
                        var fileName = GetSafeFileName(fileAttachment.FileName);
                        var content = fileAttachment.Data;
                        var contentType = string.IsNullOrWhiteSpace(fileAttachment.MimeType)
                            ? null
                            : fileAttachment.MimeType;

                        attachments.Add(new ImportedMailAttachment(
                            FileName: fileName,
                            ContentType: contentType,
                            Size: content?.LongLength ?? 0,
                            IsInline: fileAttachment.IsInline,
                            IsEmbeddedMessage: false,
                            Content: content,
                            EmbeddedMessageSubject: null));

                        break;
                    }

                case Storage.Message embeddedMessage: {
                        attachments.Add(new ImportedMailAttachment(
                            FileName: GetSafeEmbeddedMessageFileName(embeddedMessage.Subject),
                            ContentType: "application/vnd.ms-outlook",
                            Size: 0,
                            IsInline: false,
                            IsEmbeddedMessage: true,
                            Content: null,
                            EmbeddedMessageSubject: embeddedMessage.Subject?.Trim()));

                        break;
                    }
            }
        }

        return attachments;
    }
    private static string GetBestBody(Storage.Message message) {
        if (!string.IsNullOrWhiteSpace(message.BodyText)) {
            return message.BodyText;
        }

        if (!string.IsNullOrWhiteSpace(message.BodyHtml)) {
            return HtmlToText(message.BodyHtml);
        }

        if (!string.IsNullOrWhiteSpace(message.BodyRtf)) {
            return message.BodyRtf;
        }

        return string.Empty;
    }

    private static ProductStatusType GetRegistrationType(string? registrationId) {
        if (string.IsNullOrWhiteSpace(registrationId)) {
            return ProductStatusType.Unknown;
        }

        var match = RegistrationIdConversionRegex.Match(registrationId.Trim());
        if (!match.Success) {
            return ProductStatusType.Unknown;
        }

        var version = match.Groups["version"].Value;

        if (version == "000") {
            return ProductStatusType.NewEdition;
        }
        else if (!string.IsNullOrEmpty(version)) {
            return ProductStatusType.NewUpdate;
        }
        else {
            return ProductStatusType.Unknown;
        }
    }

    private static bool TryConvertRegistrationId(string registrationId, out string convertedRegistrationId) {
        convertedRegistrationId = string.Empty;

        if (string.IsNullOrWhiteSpace(registrationId)) {
            return false;
        }

        var match = RegistrationIdConversionRegex.Match(registrationId.Trim());
        if (!match.Success) {
            return false;
        }

        var prefix = match.Groups["prefix"].Value;
        var seriesNumber = match.Groups["seriesNumber"].Value;
        var tail = match.Groups["tail"].Value;
        var version = match.Groups["version"].Value;

        convertedRegistrationId = $"101{prefix}{seriesNumber.PadLeft(7, '0')}{tail}.{version}";
        return true;
    }
    private static readonly Regex RegistrationIdConversionRegex = new(
    @"^(?<prefix>[A-Z]{2,})(?<seriesNumber>\d+)(?<tail>[A-Z0-9]+)\.(?<version>\d{3})$",
    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant,
    TimeSpan.FromSeconds(2));

    private static string GetSafeFileName(string? fileName) {
        var candidate = !string.IsNullOrWhiteSpace(fileName)
            ? fileName
            : "attachment.bin";

        foreach (var invalidChar in Path.GetInvalidFileNameChars()) {
            candidate = candidate.Replace(invalidChar, '_');
        }

        return candidate;
    }

    private static string GetSafeEmbeddedMessageFileName(string? subject) {
        var safeSubject = string.IsNullOrWhiteSpace(subject)
            ? "embedded-message"
            : subject.Trim();

        foreach (var invalidChar in Path.GetInvalidFileNameChars()) {
            safeSubject = safeSubject.Replace(invalidChar, '_');
        }

        return $"{safeSubject}.msg";
    }

    private static string HtmlToText(string html) {
        if (string.IsNullOrWhiteSpace(html)) {
            return string.Empty;
        }

        var withoutTags = Regex.Replace(
            html,
            "<[^>]+>",
            " ",
            RegexOptions.CultureInvariant,
            TimeSpan.FromSeconds(2));

        return System.Net.WebUtility.HtmlDecode(withoutTags);
    }

    private static string NormalizeBody(string body) {
        if (string.IsNullOrWhiteSpace(body)) {
            return string.Empty;
        }

        body = body.Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n');

        body = Regex.Replace(
            body,
            @"\n{3,}",
            "\n\n",
            RegexOptions.CultureInvariant,
            TimeSpan.FromSeconds(2));

        return body.Trim();
    }

    private static void ValidateOptions(MailImportOptions options) {
        if (string.IsNullOrWhiteSpace(options.SourceDirectoryPath)) {
            throw new InvalidOperationException(
                "MailImport:SourceDirectoryPath must be configured.");
        }

        if (!Directory.Exists(options.SourceDirectoryPath)) {
            throw new DirectoryNotFoundException(
                $"Mail import directory does not exist: '{options.SourceDirectoryPath}'.");
        }

        if (options.BatchSize <= 0) {
            throw new InvalidOperationException(
                "MailImport:BatchSize must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(options.SearchPattern)) {
            throw new InvalidOperationException(
                "MailImport:SearchPattern must be configured.");
        }
    }
}





//var service = new ExchangeService {
//    Credentials = CredentialCache.DefaultNetworkCredentials,
//    Url = new Uri("")
//};

//var results = service.FindItems(WellKnownFolderName.Inbox, new ItemView(20));

//foreach (var email in results) {
//    email.Load();

//    var subject = email.Subject;
//    var body = email.Body.Text;

//    if (subject.Contains("rejected") || body.Contains("rejected")) {
//        Console.WriteLine($"Found keyword in: {subject}");
//    }
//}