import { statusColorConfig } from "../../../shared/config/colorsConfig.js";

const DEFAULT_FILL_ALPHA = 0.15;
const DEFAULT_OUTLINE_ALPHA = 0.7;

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
