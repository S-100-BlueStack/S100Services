import { getJobClusterPresetConfig } from "../domain/jobClusterSettings.js";

export function createJobPointFeatureReduction(settings) {
  const presetConfig = getJobClusterPresetConfig(settings);

  if (!presetConfig) {
    return null;
  }

  return removeUndefinedProperties({
    type: "cluster",
    clusterRadius: presetConfig.clusterRadius,
    clusterMinSize: presetConfig.clusterMinSize,
    clusterMaxSize: presetConfig.clusterMaxSize,
    labelingInfo: [createClusterCountLabel()],
    popupTemplate: createJobClusterPopupTemplate(),
  });
}

export function createJobClusterPopupTemplate() {
  return {
    title: "Job cluster",
    content: "This cluster contains {cluster_count} Jobs. Zoom in to inspect individual Jobs.",
    fieldInfos: [
      {
        fieldName: "cluster_count",
        label: "Jobs",
        format: {
          places: 0,
          digitSeparator: true,
        },
      },
    ],
  };
}

function createClusterCountLabel() {
  return {
    deconflictionStrategy: "none",
    labelExpressionInfo: {
      expression: "Text($feature.cluster_count, '#,###')",
    },
    labelPlacement: "center-center",
    symbol: {
      type: "text",
      color: "white",
      font: {
        family: "Noto Sans",
        size: "12px",
      },
    },
  };
}

function removeUndefinedProperties(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, propertyValue]) => propertyValue !== undefined)
  );
}
