export const JOB_CLUSTER_PRESET = Object.freeze({
  OFF: "off",
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
});

export const JOB_CLUSTER_STYLE = Object.freeze({
  COUNT: "count",
  PRIORITY_PIE: "priorityPie",
  PRIORITY_GROUPS: "priorityGroups",
});

export const JOB_CLUSTER_PRESET_OPTIONS = Object.freeze([
  {
    value: JOB_CLUSTER_PRESET.OFF,
    label: "Off",
    description: "Show individual Job points.",
  },
  {
    value: JOB_CLUSTER_PRESET.SMALL,
    label: "Small",
    description: "Use a smaller Job point clustering radius.",
  },
  {
    value: JOB_CLUSTER_PRESET.MEDIUM,
    label: "Medium",
    description: "Use ArcGIS-style basic Job point clustering.",
  },
  {
    value: JOB_CLUSTER_PRESET.LARGE,
    label: "Large",
    description: "Use a larger Job point clustering radius.",
  },
]);

export const JOB_CLUSTER_STYLE_OPTIONS = Object.freeze([
  {
    value: JOB_CLUSTER_STYLE.COUNT,
    label: "Count",
    description: "Show clusters as simple Job counts.",
  },
  {
    value: JOB_CLUSTER_STYLE.PRIORITY_PIE,
    label: "Priority pie",
    description: "Show the priority mix inside each cluster.",
  },
  {
    value: JOB_CLUSTER_STYLE.PRIORITY_GROUPS,
    label: "Priority groups",
    description: "Cluster Low, Medium and High priority Jobs separately.",
  },
]);

const DEFAULT_JOB_CLUSTER_PRESET = JOB_CLUSTER_PRESET.MEDIUM;
const DEFAULT_JOB_CLUSTER_STYLE = JOB_CLUSTER_STYLE.COUNT;

const VALID_JOB_CLUSTER_PRESETS = new Set(JOB_CLUSTER_PRESET_OPTIONS.map((option) => option.value));
const VALID_JOB_CLUSTER_STYLES = new Set(JOB_CLUSTER_STYLE_OPTIONS.map((option) => option.value));

const JOB_CLUSTER_PRESET_CONFIG = Object.freeze({
  [JOB_CLUSTER_PRESET.OFF]: null,
  [JOB_CLUSTER_PRESET.SMALL]: Object.freeze({
    clusterRadius: "40px",
    clusterMinSize: 16.5,
  }),
  [JOB_CLUSTER_PRESET.MEDIUM]: Object.freeze({
    clusterMinSize: 16.5,
  }),
  [JOB_CLUSTER_PRESET.LARGE]: Object.freeze({
    clusterRadius: "100px",
    clusterMinSize: 16.5,
  }),
});

export function createDefaultJobClusterSettings() {
  return {
    preset: DEFAULT_JOB_CLUSTER_PRESET,
    style: DEFAULT_JOB_CLUSTER_STYLE,
  };
}

export function normalizeJobClusterSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const preset = normalizeOptionalString(source.preset);
  const style = normalizeOptionalString(source.style);

  return {
    preset: VALID_JOB_CLUSTER_PRESETS.has(preset) ? preset : DEFAULT_JOB_CLUSTER_PRESET,
    style: VALID_JOB_CLUSTER_STYLES.has(style) ? style : DEFAULT_JOB_CLUSTER_STYLE,
  };
}

export function getJobClusterPresetConfig(settings = createDefaultJobClusterSettings()) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const presetConfig = JOB_CLUSTER_PRESET_CONFIG[normalizedSettings.preset];

  return presetConfig ? { ...presetConfig } : null;
}

export function getJobClusterSettingSummary(settings = createDefaultJobClusterSettings()) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const presetOption = JOB_CLUSTER_PRESET_OPTIONS.find(
    (option) => option.value === normalizedSettings.preset
  );
  const styleOption = JOB_CLUSTER_STYLE_OPTIONS.find(
    (option) => option.value === normalizedSettings.style
  );

  return `Radius: ${presetOption?.label ?? "Medium"}; Style: ${styleOption?.label ?? "Count"}`;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
