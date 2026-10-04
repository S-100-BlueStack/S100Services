using Microsoft.Extensions.Options;

namespace ProductCatalogueAPI.Options
{
    public sealed class SendToIcEncOptionsValidator : IValidateOptions<SendToIcEncOptions>
    {
        public ValidateOptionsResult Validate(string? name, SendToIcEncOptions options) {
            ArgumentNullException.ThrowIfNull(options);

            return options.Mode is SendToIcEncMode.Disabled or SendToIcEncMode.Simulation
                ? ValidateOptionsResult.Success
                : ValidateOptionsResult.Fail(
                    "SendToIcEnc:Mode must be Disabled or Simulation. Live is reserved until real delivery and acknowledgement are implemented."
                );
        }
    }
}
