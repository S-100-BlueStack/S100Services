using ProductManagerAPI.Options;

namespace ProductManagerAPI.Jobs
{
    public sealed record SendToIcEncJobRequest(
        string DatasetName,
        SendToIcEncMode Mode,
        int ExpectedEdition,
        int ExpectedUpdate,
        string CorrelationId,
        DateTimeOffset CreatedAtUtc
    );
}
