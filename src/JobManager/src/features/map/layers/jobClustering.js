import { JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import {
  JOB_CLUSTER_PRESET,
  JOB_CLUSTER_STYLE,
  getJobClusterPresetConfig,
  normalizeJobClusterSettings,
} from "../domain/jobClusterSettings.js";
import { createJobPointRenderer, createJobPriorityPointRenderer } from "./jobRenderer.js";

export function createCountJobPointFeatureReduction(settings) {
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

export async function applyJobPointClustering({
  jobLayers,
  settings,
  shouldApply = () => true,
} = {}) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const pointLayer = jobLayers?.pointLayer;

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
    applyPriorityGroupClustering(jobLayers, normalizedSettings);
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
  pointLayer.featureReduction = createCountJobPointFeatureReduction(normalizedSettings);

  return {
    ok: true,
    applied: true,
    mode: JOB_CLUSTER_STYLE.COUNT,
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

function applyPriorityGroupClustering(jobLayers, settings) {
  const featureReduction = createCountJobPointFeatureReduction(settings);

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

async function createPriorityPieJobPointFeatureReduction({ layer, settings }) {
  const baseFeatureReduction = createCountJobPointFeatureReduction(settings);

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
    popupTemplate: createPriorityPieClusterPopupTemplate(fields),
  };
}

function createPriorityPieClusterPopupTemplate(fields = []) {
  const fieldInfos = fields.map((field) => ({
    fieldName: field.name,
    label: field.alias,
    format: {
      places: 0,
      digitSeparator: true,
    },
  }));
  const fieldNames = fieldInfos.map((fieldInfo) => fieldInfo.fieldName);

  return {
    title: "Priority cluster",
    content: [
      {
        type: "text",
        text: "This cluster contains <b>{cluster_count}</b> Jobs.",
      },
      {
        type: "media",
        mediaInfos: [
          {
            title: "Priority distribution",
            type: "pie-chart",
            value: {
              fields: fieldNames,
            },
          },
        ],
      },
      {
        type: "fields",
        fieldInfos,
      },
    ],
    fieldInfos,
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
