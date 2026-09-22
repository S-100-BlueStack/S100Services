import { JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import {
  JOB_CLUSTER_PRESET,
  JOB_CLUSTER_STYLE,
  getJobClusterPresetConfig,
  normalizeJobClusterSettings,
} from "../domain/jobClusterSettings.js";
import { createJobClusterPickerContent } from "../popups/jobClusterPopupContent.js";
import { createJobPointRenderer, createJobPriorityPointRenderer } from "./jobRenderer.js";

export function createCountJobPointFeatureReduction(settings, clusterPopupOptions) {
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
    popupTemplate: createJobClusterPopupTemplate(clusterPopupOptions),
  });
}

export async function applyJobPointClustering({
  jobLayers,
  settings,
  view,
  shouldApply = () => true,
} = {}) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const pointLayer = jobLayers?.pointLayer;
  const clusterPopupOptions = {
    view,
  };

  if (!pointLayer) {
    return {
      ok: true,
      applied: false,
      reason: "point-layer-missing",
    };
  }

  if (normalizedSettings.preset === JOB_CLUSTER_PRESET.OFF) {
    applyOffClustering(jobLayers);
    return {
      ok: true,
      applied: true,
      mode: "off",
    };
  }

  if (normalizedSettings.style === JOB_CLUSTER_STYLE.PRIORITY_GROUPS) {
    applyPriorityGroupClustering(jobLayers, normalizedSettings, clusterPopupOptions);
    return {
      ok: true,
      applied: true,
      mode: JOB_CLUSTER_STYLE.PRIORITY_GROUPS,
    };
  }

  hidePriorityPointLayers(jobLayers);
  pointLayer.visible = true;

  if (normalizedSettings.style === JOB_CLUSTER_STYLE.PRIORITY_PIE) {
    const featureReduction = await createPriorityPieJobPointFeatureReduction({
      layer: pointLayer,
      settings: normalizedSettings,
      clusterPopupOptions,
    });

    if (!shouldApply()) {
      return {
        ok: true,
        applied: false,
        reason: "stale-cluster-request",
      };
    }

    pointLayer.renderer = createJobPriorityPointRenderer();
    pointLayer.featureReduction = featureReduction;

    return {
      ok: true,
      applied: true,
      mode: JOB_CLUSTER_STYLE.PRIORITY_PIE,
    };
  }

  pointLayer.renderer = createJobPointRenderer();
  pointLayer.featureReduction = createCountJobPointFeatureReduction(
    normalizedSettings,
    clusterPopupOptions
  );

  return {
    ok: true,
    applied: true,
    mode: JOB_CLUSTER_STYLE.COUNT,
  };
}

export function createJobClusterPopupTemplate({ view } = {}) {
  return {
    title: `{cluster_count} Jobs in this cluster`,
    outFields: ["*"],
    content: [
      createJobClusterPickerContent({
        view,
      }),
    ],
    actions: [],
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

function applyOffClustering(jobLayers) {
  hidePriorityPointLayers(jobLayers);

  if (jobLayers?.pointLayer) {
    jobLayers.pointLayer.visible = true;
    jobLayers.pointLayer.renderer = createJobPointRenderer();
    jobLayers.pointLayer.featureReduction = null;
  }

  for (const priorityLayer of getPriorityPointLayers(jobLayers)) {
    priorityLayer.featureReduction = null;
  }
}

function applyPriorityGroupClustering(jobLayers, settings, clusterPopupOptions) {
  const featureReduction = createCountJobPointFeatureReduction(settings, clusterPopupOptions);

  if (jobLayers?.pointLayer) {
    jobLayers.pointLayer.visible = false;
    jobLayers.pointLayer.featureReduction = null;
  }

  for (const priorityLayer of getPriorityPointLayers(jobLayers)) {
    priorityLayer.visible = true;
    priorityLayer.renderer = createJobPriorityPointRenderer();
    priorityLayer.featureReduction = featureReduction ? { ...featureReduction } : null;
  }
}

async function createPriorityPieJobPointFeatureReduction({ layer, settings, clusterPopupOptions }) {
  const baseFeatureReduction = createCountJobPointFeatureReduction(settings, clusterPopupOptions);

  if (!baseFeatureReduction) {
    return null;
  }

  layer.renderer = createJobPriorityPointRenderer();
  layer.featureReduction = baseFeatureReduction;

  const pieChartRendererCreator = await import("@arcgis/core/smartMapping/renderers/pieChart.js");
  const { renderer, fields } = await pieChartRendererCreator.createRendererForClustering({
    layer,
    shape: "donut",
    defaultSymbolEnabled: false,
  });

  renderer.holePercentage = 0.58;

  return {
    ...baseFeatureReduction,
    renderer,
    fields,
    popupTemplate: createJobClusterPopupTemplate(clusterPopupOptions),
  };
}

function hidePriorityPointLayers(jobLayers) {
  for (const priorityLayer of getPriorityPointLayers(jobLayers)) {
    priorityLayer.visible = false;
  }
}

function getPriorityPointLayers(jobLayers) {
  return [
    jobLayers?.priorityPointLayers?.[JOB_PRIORITY.LOW],
    jobLayers?.priorityPointLayers?.[JOB_PRIORITY.MEDIUM],
    jobLayers?.priorityPointLayers?.[JOB_PRIORITY.HIGH],
  ].filter(Boolean);
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
