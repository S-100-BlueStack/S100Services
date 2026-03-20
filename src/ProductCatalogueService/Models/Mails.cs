namespace ProductCatalogueService.Models;

public enum ProductStatusEmailCategory
{
    Unknown = 0,
    CellRegistration = 1,
    ValidationOfCell = 2,
    Other = 3
}

public enum ProductStatusEmailOutcome
{
    Unknown = 0,
    Successful = 1,
    AcceptedForDistribution = 2,
    NotAcceptedForDistribution = 3,
    PassedInHolding = 4,
    FailureToRegister = 5
}

public sealed record ImportedMailAttachment(
    string FileName,
    string? ContentType,
    long Size,
    bool IsInline,
    bool IsEmbeddedMessage,
    byte[]? Content,
    string? EmbeddedMessageSubject);

public sealed record ImportedMailMessage(
    string FilePath,
    string Subject,
    string Body,
    IReadOnlyList<ImportedMailAttachment> Attachments);

public sealed record ParsedProductStatusEmail(
    string FilePath,
    string OriginalSubject,
    ProductStatusEmailCategory Category,
    ProductStatusEmailOutcome Outcome,
    string? RegistrationId,
    string? Crc,
    bool IsCatalog,
    ImportedMailAttachment? DocumentAttachment,
    bool IsRelevant);
public sealed class MailProcessingStats
{
    public int FolderCount { get; set; }
    public int MessageCount { get; set; }
    public int RelevantCount { get; set; }
    public int IrrelevantCount { get; set; }
    public int ProductMatchCount { get; set; }
    public int ProductMissCount { get; set; }
    public int ErrorCount { get; set; }
}