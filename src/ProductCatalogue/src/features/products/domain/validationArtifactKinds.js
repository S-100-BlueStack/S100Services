// These are public ProductArtifactKind values from the artifact-history API.
const INTERNAL_KINDS = new Set(["ValidationReport", "ValidationDiagnostic"]);

export function partitionValidationArtifacts(artifacts) {
  const internalValidation = [];
  const icEncReports = [];
  const unknown = [];
  for (const artifact of artifacts ?? []) {
    if (artifact?.kind === "IcEncReport") {
      icEncReports.push(artifact);
    } else if (INTERNAL_KINDS.has(artifact?.kind)) {
      internalValidation.push(artifact);
    } else {
      // Unknown or missing provenance must not become an IC-ENC or SevenCs report.
      unknown.push(artifact);
    }
  }
  return { internalValidation, icEncReports, unknown };
}
