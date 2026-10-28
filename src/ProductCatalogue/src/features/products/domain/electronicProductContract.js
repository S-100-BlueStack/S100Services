// Specification comes from the selected AOI contract, never the dataset name.
export function createElectronicExportConfiguration(specification, label) {
  return {
    visible: true,
    displayLabel: label,
    helpText: `Create ${label} export candidate.`,
    leaves: ["Edition", "Update"].map((kind) => ({
      id: `export-${kind.toLowerCase()}`,
      label: kind,
      operationKind: kind,
      capability: `export${kind}`,
      visible: true,
      implemented: true,
      backendTarget: specification,
      handlerId: `export-new-${kind.toLowerCase()}`,
      helpText: `Create ${label} ${kind} export candidate.`,
      confirmation: {
        title: `Export ${kind.toLowerCase()} for {datasetName}`,
        message: `Create ${label} ${kind} export candidate for {datasetName}? This operation does not publish the Product.`,
        confirmText: `Export ${kind.toLowerCase()}`,
      },
    })),
  };
}
