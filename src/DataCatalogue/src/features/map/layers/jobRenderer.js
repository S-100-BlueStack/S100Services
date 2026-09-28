import { JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import { JOB_LAYER_FIELD, JOB_RENDER_CLASS } from "./jobLayerFeatureData.js";

const JOB_SYMBOL_COLOR = Object.freeze({
  LOW_FILL: Object.freeze([34, 112, 147, 0.75]),
  LOW_OUTLINE: Object.freeze([20, 74, 97, 1]),
  MEDIUM_FILL: Object.freeze([255, 174, 0, 0.8]),
  MEDIUM_OUTLINE: Object.freeze([173, 119, 0, 1]),
  HIGH_FILL: Object.freeze([155, 28, 49, 0.82]),
  HIGH_OUTLINE: Object.freeze([105, 20, 35, 1]),
  DONE_FILL: Object.freeze([108, 117, 125, 0.45]),
  DONE_OUTLINE: Object.freeze([78, 87, 95, 0.9]),
});

export function createJobPointRenderer() {
  return {
    type: "unique-value",
    field: JOB_LAYER_FIELD.RENDER_CLASS,
    defaultSymbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_MEDIUM),
    defaultLabel: "Active Jobs",
    uniqueValueInfos: [
      {
        value: JOB_RENDER_CLASS.ACTIVE_LOW,
        label: "Low-priority active Jobs",
        symbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_LOW),
      },
      {
        value: JOB_RENDER_CLASS.ACTIVE_MEDIUM,
        label: "Medium-priority active Jobs",
        symbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_MEDIUM),
      },
      {
        value: JOB_RENDER_CLASS.ACTIVE_HIGH,
        label: "High-priority active Jobs",
        symbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_HIGH),
      },
      {
        value: JOB_RENDER_CLASS.DONE,
        label: "Done Jobs",
        symbol: createPointSymbol(JOB_RENDER_CLASS.DONE),
      },
    ],
  };
}

export function createJobPriorityPointRenderer() {
  return {
    type: "unique-value",
    field: JOB_LAYER_FIELD.PRIORITY,
    defaultSymbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_MEDIUM),
    defaultLabel: "Medium Priority",
    uniqueValueInfos: [
      {
        value: JOB_PRIORITY.LOW,
        label: "Low Priority",
        symbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_LOW),
      },
      {
        value: JOB_PRIORITY.MEDIUM,
        label: "Medium Priority",
        symbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_MEDIUM),
      },
      {
        value: JOB_PRIORITY.HIGH,
        label: "High Priority",
        symbol: createPointSymbol(JOB_RENDER_CLASS.ACTIVE_HIGH),
      },
    ],
  };
}

export function createJobPolygonRenderer() {
  return {
    type: "unique-value",
    field: JOB_LAYER_FIELD.RENDER_CLASS,
    defaultSymbol: createPolygonSymbol(JOB_RENDER_CLASS.ACTIVE_MEDIUM),
    defaultLabel: "Active Jobs",
    uniqueValueInfos: [
      {
        value: JOB_RENDER_CLASS.ACTIVE_LOW,
        label: "Low-priority active Jobs",
        symbol: createPolygonSymbol(JOB_RENDER_CLASS.ACTIVE_LOW),
      },
      {
        value: JOB_RENDER_CLASS.ACTIVE_MEDIUM,
        label: "Medium-priority active Jobs",
        symbol: createPolygonSymbol(JOB_RENDER_CLASS.ACTIVE_MEDIUM),
      },
      {
        value: JOB_RENDER_CLASS.ACTIVE_HIGH,
        label: "High-priority active Jobs",
        symbol: createPolygonSymbol(JOB_RENDER_CLASS.ACTIVE_HIGH),
      },
      {
        value: JOB_RENDER_CLASS.DONE,
        label: "Done Jobs",
        symbol: createPolygonSymbol(JOB_RENDER_CLASS.DONE),
      },
    ],
  };
}

function createPointSymbol(renderClass) {
  const colorConfig = getColorConfig(renderClass);

  return {
    type: "simple-marker",
    style: "circle",
    color: [...colorConfig.fill],
    size: renderClass === JOB_RENDER_CLASS.ACTIVE_HIGH ? 11 : 9,
    outline: {
      color: [...colorConfig.outline],
      width: 1.5,
    },
  };
}

function createPolygonSymbol(renderClass) {
  const colorConfig = getColorConfig(renderClass);

  return {
    type: "simple-fill",
    style: "solid",
    color: [...colorConfig.fill],
    outline: {
      color: [...colorConfig.outline],
      width: renderClass === JOB_RENDER_CLASS.ACTIVE_HIGH ? 2 : 1.4,
    },
  };
}

function getColorConfig(renderClass) {
  if (renderClass === JOB_RENDER_CLASS.ACTIVE_LOW) {
    return {
      fill: JOB_SYMBOL_COLOR.LOW_FILL,
      outline: JOB_SYMBOL_COLOR.LOW_OUTLINE,
    };
  }

  if (renderClass === JOB_RENDER_CLASS.ACTIVE_HIGH) {
    return {
      fill: JOB_SYMBOL_COLOR.HIGH_FILL,
      outline: JOB_SYMBOL_COLOR.HIGH_OUTLINE,
    };
  }

  if (renderClass === JOB_RENDER_CLASS.DONE) {
    return {
      fill: JOB_SYMBOL_COLOR.DONE_FILL,
      outline: JOB_SYMBOL_COLOR.DONE_OUTLINE,
    };
  }

  return {
    fill: JOB_SYMBOL_COLOR.MEDIUM_FILL,
    outline: JOB_SYMBOL_COLOR.MEDIUM_OUTLINE,
  };
}
