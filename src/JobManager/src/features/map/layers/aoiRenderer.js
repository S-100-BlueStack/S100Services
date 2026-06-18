import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export const AOI_RENDERER_SEVERITY = Object.freeze({
  NONE: 0,
  ACTIVE: 1,
  HIGH: 2,
});

const AOI_SYMBOL_COLOR = Object.freeze({
  NONE_FILL: Object.freeze([69, 97, 120, 0.1]),
  NONE_OUTLINE: Object.freeze([69, 97, 120, 0.55]),
  ACTIVE_FILL: Object.freeze([255, 174, 0, 0.26]),
  ACTIVE_OUTLINE: Object.freeze([173, 119, 0, 0.95]),
  HIGH_FILL: Object.freeze([155, 28, 49, 0.3]),
  HIGH_OUTLINE: Object.freeze([155, 28, 49, 1]),
});

export function createDefaultAoiRenderer() {
  return {
    type: "simple",
    symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.NONE),
    label: "Areas of Interest",
  };
}

export function createAoiJobSummaryRenderer(
  summaryByAoiId,
  { idField = AOI_FIELD.GLOBAL_ID } = {}
) {
  const severityEntries = createAoiSeverityEntries(summaryByAoiId);

  if (severityEntries.length === 0) {
    return createDefaultAoiRenderer();
  }

  return {
    type: "class-breaks",
    valueExpression: createAoiJobSeverityExpression(severityEntries, { idField }),
    valueExpressionTitle: "AOI Job status",
    defaultSymbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.NONE),
    defaultLabel: "No active Jobs",
    legendOptions: {
      title: "AOI Job status",
      order: "descending-values",
    },
    classBreakInfos: [
      {
        minValue: AOI_RENDERER_SEVERITY.NONE,
        maxValue: AOI_RENDERER_SEVERITY.NONE,
        symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.NONE),
        label: "No active Jobs",
      },
      {
        minValue: AOI_RENDERER_SEVERITY.ACTIVE,
        maxValue: AOI_RENDERER_SEVERITY.ACTIVE,
        symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.ACTIVE),
        label: "Active Jobs",
      },
      {
        minValue: AOI_RENDERER_SEVERITY.HIGH,
        maxValue: AOI_RENDERER_SEVERITY.HIGH,
        symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.HIGH),
        label: "High-priority active Jobs",
      },
    ],
  };
}

export function createAoiJobSeverityExpression(
  severityEntries,
  { idField = AOI_FIELD.GLOBAL_ID } = {}
) {
  const conditions = normalizeSeverityEntries(severityEntries).map(
    ([aoiId, severity]) => `aoiId == ${JSON.stringify(aoiId)}, ${severity}`
  );

  if (conditions.length === 0) {
    return `return ${AOI_RENDERER_SEVERITY.NONE};`;
  }

  return [
    `var aoiId = Text($feature[${JSON.stringify(idField)}]);`,
    `return When(${conditions.join(", ")}, ${AOI_RENDERER_SEVERITY.NONE});`,
  ].join("\n");
}

export function getAoiJobSeverity(summary) {
  const active = normalizeCount(summary?.active);
  const activeHighPriority = hasOwnProperty(summary, "activeHighPriority")
    ? normalizeCount(summary.activeHighPriority)
    : Math.min(active, normalizeCount(summary?.highPriority));

  if (activeHighPriority > 0) {
    return AOI_RENDERER_SEVERITY.HIGH;
  }

  if (active > 0) {
    return AOI_RENDERER_SEVERITY.ACTIVE;
  }

  return AOI_RENDERER_SEVERITY.NONE;
}

function createAoiSeverityEntries(summaryByAoiId) {
  const entries = getSummaryEntries(summaryByAoiId);

  return entries
    .map(([aoiId, summary]) => [normalizeOptionalString(aoiId), getAoiJobSeverity(summary)])
    .filter(([aoiId, severity]) => aoiId && severity > AOI_RENDERER_SEVERITY.NONE);
}

function normalizeSeverityEntries(severityEntries) {
  if (!Array.isArray(severityEntries)) {
    return [];
  }

  return severityEntries
    .map(([aoiId, severity]) => [
      normalizeOptionalString(aoiId),
      normalizeRendererSeverity(severity),
    ])
    .filter(([aoiId, severity]) => aoiId && severity > AOI_RENDERER_SEVERITY.NONE);
}

function getSummaryEntries(summaryByAoiId) {
  if (summaryByAoiId instanceof Map) {
    return [...summaryByAoiId.entries()];
  }

  if (!summaryByAoiId || typeof summaryByAoiId !== "object") {
    return [];
  }

  return Object.entries(summaryByAoiId);
}

function createAoiFillSymbol(severity) {
  const colorConfig = getAoiSymbolColorConfig(severity);

  return {
    type: "simple-fill",
    style: "solid",
    color: [...colorConfig.fill],
    outline: {
      color: [...colorConfig.outline],
      width: colorConfig.outlineWidth,
    },
  };
}

function getAoiSymbolColorConfig(severity) {
  if (severity === AOI_RENDERER_SEVERITY.HIGH) {
    return {
      fill: AOI_SYMBOL_COLOR.HIGH_FILL,
      outline: AOI_SYMBOL_COLOR.HIGH_OUTLINE,
      outlineWidth: 1.75,
    };
  }

  if (severity === AOI_RENDERER_SEVERITY.ACTIVE) {
    return {
      fill: AOI_SYMBOL_COLOR.ACTIVE_FILL,
      outline: AOI_SYMBOL_COLOR.ACTIVE_OUTLINE,
      outlineWidth: 1.5,
    };
  }

  return {
    fill: AOI_SYMBOL_COLOR.NONE_FILL,
    outline: AOI_SYMBOL_COLOR.NONE_OUTLINE,
    outlineWidth: 1,
  };
}

function normalizeRendererSeverity(value) {
  const severity = Number(value);

  if (!Number.isFinite(severity)) {
    return AOI_RENDERER_SEVERITY.NONE;
  }

  if (severity >= AOI_RENDERER_SEVERITY.HIGH) {
    return AOI_RENDERER_SEVERITY.HIGH;
  }

  if (severity >= AOI_RENDERER_SEVERITY.ACTIVE) {
    return AOI_RENDERER_SEVERITY.ACTIVE;
  }

  return AOI_RENDERER_SEVERITY.NONE;
}

function normalizeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.trunc(count);
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function hasOwnProperty(value, propertyName) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, propertyName);
}
