namespace ProductCatalogueAPI.Jobs
{
    public static class ExportJobParameterNames
    {
        public const string DatasetName = "ProductManagerDatasetName";
        public const string OperationType = "ProductManagerOperationType";
        public const string ExportTarget = "ProductManagerExportTarget";
        public const string ExpectedEdition = "ProductManagerExpectedEdition";
        public const string ExpectedUpdate = "ProductManagerExpectedUpdate";
        public const string CorrelationId = "ProductManagerCorrelationId";
        public const string CreatedAtUtc = "ProductManagerCreatedAtUtc";
        public const string ExecutionStarted = "ProductManagerExecutionStarted";
        public const string Mode = "ProductManagerMode";
        public const string OperationOutcome = "ProductManagerOperationOutcome";
        public const string DeliveryStatus = "ProductManagerDeliveryStatus";
        public const string ResultCode = "ProductManagerResultCode";
        public const string ResultMessage = "ProductManagerResultMessage";
        public const string WarningCode = "ProductManagerWarningCode";
        public const string WarningMessage = "ProductManagerWarningMessage";
        public const string ErrorCode = "ProductManagerErrorCode";
        public const string ErrorMessage = "ProductManagerErrorMessage";
    }

    public static class ExportJobContract
    {
        public const string QueuedStatus = "Queued";
        public const string RunningStatus = "Running";
        public const string SucceededStatus = "Succeeded";
        public const string FailedStatus = "Failed";
        public const string CancelledStatus = "Cancelled";
        public const string ProductNotFoundCode = "PRODUCT_NOT_FOUND";
        public const string ProductNotFoundStartMessage = "The product was not found.";
        public const string ProductNoLongerAvailableMessage = "The product is no longer available.";
        public const string ProductVersionUnavailableCode = "PRODUCT_VERSION_UNAVAILABLE";
        public const string ProductVersionUnavailableMessage = "The product does not have a usable edition and update version.";
        public const string ProductVersionChangedCode = "PRODUCT_VERSION_CHANGED";
        public const string ProductVersionChangedMessage = "The product changed after the job was created.";
        public const string ProductDataIntegrityErrorCode = "PRODUCT_DATA_INTEGRITY_ERROR";
        public const string ProductDataIntegrityStartMessage = "The product data is ambiguous and the operation cannot be started.";
        public const string ProductDataIntegrityJobMessage = "The product data is ambiguous and the operation could not be started.";
        public const string ManualReviewRequiredCode = "MANUAL_REVIEW_REQUIRED";
        public const string ManualReviewRequiredMessage = "The job may already have started and was not executed again.";
        public const string DatasetBusyCode = "DATASET_BUSY";
        public const string DatasetBusyMessage = "The product is already being processed.";
        public const string ProductOperationRejectedCode = "PRODUCT_OPERATION_REJECTED";
        public const string ExportFailedCode = "EXPORT_FAILED";
        public const string ExportFailedMessage = "The export could not be completed.";
        public const string CancelExportFailedCode = "CANCEL_EXPORT_FAILED";
        public const string CancelExportFailedMessage = "The candidate export could not be cancelled.";
        public const string JobFailedCode = "JOB_FAILED";
        public const string JobFailedMessage = "The operation could not be completed.";
        public const string JobEnqueueFailedCode = "JOB_ENQUEUE_FAILED";
        public const string JobEnqueueFailedMessage = "The operation could not be queued.";
        public const string JobNotFoundCode = "JOB_NOT_FOUND";
        public const string JobNotFoundMessage = "The job was not found.";
        public const string DatasetNameRequiredCode = "DATASET_NAME_REQUIRED";
        public const string DatasetNameRequiredMessage = "A datasetName query parameter is required.";
    }

    public static class SendToIcEncContract
    {
        public const string OperationType = "SendToIcEnc";
        public const string DisabledCode = "SEND_TO_ICENC_DISABLED";
        public const string DisabledMessage = "Send to IC-ENC is disabled.";
        public const string UnsupportedModeCode = "SEND_TO_ICENC_MODE_UNAVAILABLE";
        public const string UnsupportedModeMessage = "The configured Send to IC-ENC mode is unavailable.";
        public const string SimulationMode = "Simulation";
        public const string SimulationCompletedOutcome = "SimulationCompleted";
        public const string NotDeliveredStatus = "NotDelivered";
        public const string AcceptedMessage = "IC-ENC send simulation was accepted. No data will be delivered.";
        public const string CompletedCode = "SEND_SIMULATION_COMPLETED";
        public const string CompletedMessage = "Simulation completed. No data was sent to IC-ENC.";
        public const string ConfigurationChangedCode = "SEND_TO_ICENC_CONFIGURATION_CHANGED";
        public const string ConfigurationChangedMessage = "The Send to IC-ENC configuration changed before the simulation started.";
        public const string InvalidStateCode = "SEND_TO_ICENC_PRODUCT_STATE_INVALID";
        public const string InvalidStateStartMessage = "The product must be ReadyForDistribution before an IC-ENC send simulation can start.";
        public const string InvalidStateJobMessage = "The product state changed before the IC-ENC send simulation started.";
        public const string SetupFailedCode = "SEND_SIMULATION_SETUP_FAILED";
        public const string SetupFailedMessage = "The IC-ENC send simulation could not be prepared.";
        public const string FailedCode = "SEND_SIMULATION_FAILED";
        public const string FailedMessage = "The IC-ENC send simulation could not be completed.";
    }
}
