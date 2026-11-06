using Microsoft.Extensions.Options;

namespace ProductCatalogueAPI.Options
{
    public sealed class SendToIcEncOptionsValidator : IValidateOptions<SendToIcEncOptions>
    {
        public ValidateOptionsResult Validate(string? name, SendToIcEncOptions options) {
            ArgumentNullException.ThrowIfNull(options);

            if (options.Mode is SendToIcEncMode.Disabled or SendToIcEncMode.Simulation)
                return ValidateOptionsResult.Success;
            if (options.Mode != SendToIcEncMode.Live)
                return ValidateOptionsResult.Fail("SendToIcEnc:Mode is unknown.");
            return !string.IsNullOrWhiteSpace(options.Host) && options.Port is > 0 and <= 65535 &&
                   !string.IsNullOrWhiteSpace(options.Username) && !string.IsNullOrWhiteSpace(options.Password) &&
                   !string.IsNullOrWhiteSpace(options.OperatorKey) &&
                   IsAbsoluteRemotePath(options.S57RemoteRoot) && IsAbsoluteRemotePath(options.S101RemoteRoot)
                ? ValidateOptionsResult.Success
                : ValidateOptionsResult.Fail("Live IC-ENC delivery requires Host, Port, Username, Password, OperatorKey, S57RemoteRoot and S101RemoteRoot. Configure credentials via a secret provider.");
        }

        private static bool IsAbsoluteRemotePath(string? path) =>
            !string.IsNullOrWhiteSpace(path) && path.StartsWith('/') && path.Length > 1 &&
            !path.Contains("..", StringComparison.Ordinal) && !path.Contains('\\');
    }
}
