export function createJobPointFeatureReduction() {
  return {
    type: "cluster",
    clusterRadius: "128px",
    clusterMinSize: "26px",
    clusterMaxSize: "48px",
    labelingInfo: [createClusterCountLabel()],
    popupTemplate: createJobClusterPopupTemplate(),
  };
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
        family: "Arial",
        size: 11,
        weight: "bold",
      },
      haloColor: "black",
      haloSize: 1,
    },
  };
}
