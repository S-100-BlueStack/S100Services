namespace ProductManagerAPI.Options
{
    public enum SendToIcEncMode
    {
        Disabled = 0,
        Simulation = 1,
        Live = 2
    }

    public sealed class SendToIcEncOptions
    {
        public const string SectionName = "SendToIcEnc";

        public SendToIcEncMode Mode { get; set; } = SendToIcEncMode.Disabled;
    }
}
