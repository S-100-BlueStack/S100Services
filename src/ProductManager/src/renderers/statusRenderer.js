import { statusConfig } from "../config/colorsConfig";

const uniqueValueInfos = Object.entries(statusConfig).map(([value, cfg]) => ({
  value: Number(value),
  label: cfg.label,
  symbol: {
    type: "simple-fill",
    color: cfg.fill,
    outline: {
      color: cfg.outline,
      width: 1,
    },
  },
}));

export const statusRenderer = {
  type: "unique-value",
  field: "status",
  uniqueValueInfos,
};
