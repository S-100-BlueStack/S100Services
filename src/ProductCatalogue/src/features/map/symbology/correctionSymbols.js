import { statusColorConfig } from "../../../shared/config/colorsConfig.js";

const DEFAULT_FILL_ALPHA = 0.15;
const DEFAULT_OUTLINE_ALPHA = 0.7;
const MIXED_BASE_FILL_ALPHA = 0.35;
const MIXED_HATCH_ALPHA = 0.65;
const MIXED_HATCH_WIDTH = 3;
const MIXED_HATCH_SEPARATION = 8;

export function getCorrectionSymbol(status, { fillAlpha = DEFAULT_FILL_ALPHA } = {}) {
  const cfg = statusColorConfig[status];

  if (!cfg) {
    return {
      type: "simple-fill",
      color: `rgba(0, 0, 0, ${fillAlpha})`,
      outline: {
        color: `rgba(0, 0, 0, ${DEFAULT_OUTLINE_ALPHA})`,
        width: 1,
      },
    };
  }

  return {
    type: "simple-fill",
    color: withAlpha(cfg.fill, fillAlpha),
    outline: {
      color: withAlpha(cfg.outline, DEFAULT_OUTLINE_ALPHA),
      width: 1,
    },
  };
}

export function getMixedCorrectionSymbol(memberStatuses) {
  const statuses = normalizeMixedStatuses(memberStatuses);

  if (statuses.length < 2) {
    return getCorrectionSymbol(statuses[0]);
  }

  const [baseStatus, ...overlayStatuses] = statuses;
  const hatchCount = overlayStatuses.length;

  return {
    type: "cim",
    data: {
      type: "CIMSymbolReference",
      symbol: {
        type: "CIMPolygonSymbol",
        symbolLayers: [
          createCimOutline(baseStatus),
          ...overlayStatuses.map((status, index) =>
            createCimHatchFill(status, {
              rotation: getHatchRotation(index, hatchCount),
            })
          ),
          createCimSolidFill(baseStatus),
        ],
      },
    },
  };
}

export function hasCorrectionStatusColor(status) {
  return Object.hasOwn(statusColorConfig, status);
}

function createCimOutline(status) {
  return {
    type: "CIMSolidStroke",
    enable: true,
    capStyle: "Round",
    joinStyle: "Round",
    miterLimit: 10,
    width: 1,
    color: getCimStatusColor(status, "outline", DEFAULT_OUTLINE_ALPHA),
  };
}

function createCimSolidFill(status) {
  return {
    type: "CIMSolidFill",
    enable: true,
    color: getCimStatusColor(status, "fill", MIXED_BASE_FILL_ALPHA),
  };
}

function createCimHatchFill(status, { rotation }) {
  return {
    type: "CIMHatchFill",
    enable: true,
    lineSymbol: {
      type: "CIMLineSymbol",
      symbolLayers: [
        {
          type: "CIMSolidStroke",
          enable: true,
          capStyle: "Butt",
          joinStyle: "Miter",
          miterLimit: 10,
          width: MIXED_HATCH_WIDTH,
          color: getCimStatusColor(status, "outline", MIXED_HATCH_ALPHA),
        },
      ],
    },
    rotation,
    separation: MIXED_HATCH_SEPARATION,
  };
}

function getHatchRotation(index, count) {
  if (count <= 1) {
    return 45;
  }

  const minimum = 30;
  const maximum = 150;
  return minimum + ((maximum - minimum) * index) / (count - 1);
}

function normalizeMixedStatuses(statuses) {
  const values = Array.isArray(statuses) ? statuses : [statuses];

  return [...new Set(values.map(normalizeStatus).filter(Boolean))].sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left < right ? -1 : 1;
  });
}

function normalizeStatus(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function getCimStatusColor(status, colorType, alpha) {
  const cfg = statusColorConfig[status];
  const parsed = parseRgbColor(cfg?.[colorType]);
  const [red, green, blue] = parsed ?? [0, 0, 0];

  return [red, green, blue, Math.round(alpha * 255)];
}

function parseRgbColor(color) {
  if (Array.isArray(color) && color.length >= 3) {
    return color.slice(0, 3).map((value) => Number(value));
  }

  if (typeof color !== "string") {
    return null;
  }

  const match = color.match(/^rgba?\(([^)]+)\)$/i);

  if (!match) {
    return null;
  }

  const parts = match[1]
    .split(",")
    .slice(0, 3)
    .map((part) => Number(part.trim()));

  return parts.every(Number.isFinite) ? parts : null;
}

function withAlpha(color, alpha) {
  if (Array.isArray(color)) {
    return [color[0], color[1], color[2], alpha];
  }

  if (typeof color !== "string") {
    return color;
  }

  const match = color.match(/^rgba?\(([^)]+)\)$/i);

  if (!match) {
    return color;
  }

  const parts = match[1].split(",").map((part) => part.trim());

  if (parts.length < 3) {
    return color;
  }

  const [red, green, blue] = parts;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
