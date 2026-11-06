namespace ProductCatalogueAPI.Options
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

        /// <summary>FTPS server used by the delivery worker.</summary>
        public string? Host { get; set; }
        public int Port { get; set; } = 21;
        public string? Username { get; set; }
        /// <summary>Supply through a secret configuration provider or environment variable, never appsettings.json.</summary>
        public string? Password { get; set; }
        /// <summary>Required API operator key for live sends while API authentication is not enabled.</summary>
        public string? OperatorKey { get; set; }
        /// <summary>Existing IC-ENC intake directories. The worker will not replace an existing delivery directory.</summary>
        public string? S57RemoteRoot { get; set; }
        public string? S101RemoteRoot { get; set; }
    }
}
