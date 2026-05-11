import { statusColorConfig } from "../../../shared/config/colorsConfig.js";

export function getCorrectionSymbol(status, { variant = "detail" } = {}) {
  const cfg = statusColorConfig[status];

  if (!cfg) {
    return {
      type: "simple-fill",
      color: variant === "overview" ? "rgba(0, 0, 0, 0.08)" : "rgba(0, 0, 0, 0.5)",
      outline: {
        color: "rgba(0, 0, 0, 1)",
        width: variant === "overview" ? 1.5 : 1,
      },
    };
  }

  return {
    type: "simple-fill",
    color: variant === "overview" ? withAlpha(cfg.fill, 0.08) : cfg.fill,
    outline: {
      color: cfg.outline,
      width: variant === "overview" ? 1.5 : 1,
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
