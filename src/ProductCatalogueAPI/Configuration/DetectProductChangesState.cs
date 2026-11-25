namespace ProductCatalogueAPI.Options
{
    /// <summary>Stores the startup decision used by both the scheduler and the worker entry point.</summary>
    public sealed class DetectProductChangesState
    {
        private DetectProductChangesState(bool enabled) {
            Enabled = enabled;
        }

        /// <summary>Indicates whether ENC detection is allowed for this process lifetime.</summary>
        public bool Enabled { get; }

        public static DetectProductChangesState FromConfiguration(IConfiguration configuration) {
            var value = configuration["EnableDetectProductChanges"];
            if (value == null)
                return new DetectProductChangesState(false);

            if (!bool.TryParse(value, out var enabled))
                throw new InvalidOperationException(
                    "DETECT_PRODUCT_CHANGES_CONFIGURATION_INVALID: Product change detection configuration must be a Boolean value."
                );

            // Retain only the startup decision; configuration reload must not alter execution.
            return new DetectProductChangesState(enabled);
        }

        public void EnsureEnabled() {
            if (!Enabled)
                throw new DetectProductChangesDisabledException();
        }
    }

    public sealed class DetectProductChangesDisabledException() : InvalidOperationException(
        "DETECT_PRODUCT_CHANGES_DISABLED: Product change detection is disabled by application configuration."
    )
    {
        public string Code => "DETECT_PRODUCT_CHANGES_DISABLED";
    }
}
