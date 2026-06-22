export const JOB_CLUSTER_PRESET = Object.freeze({
  OFF: "off",
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
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

const DEFAULT_JOB_CLUSTER_PRESET = JOB_CLUSTER_PRESET.MEDIUM;
const VALID_JOB_CLUSTER_PRESETS = new Set(JOB_CLUSTER_PRESET_OPTIONS.map((option) => option.value));

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
  };
}

export function normalizeJobClusterSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const preset = normalizeOptionalString(source.preset);

  return {
    preset: VALID_JOB_CLUSTER_PRESETS.has(preset) ? preset : DEFAULT_JOB_CLUSTER_PRESET,
  };
}

export function getJobClusterPresetConfig(settings = createDefaultJobClusterSettings()) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const presetConfig = JOB_CLUSTER_PRESET_CONFIG[normalizedSettings.preset];

  return presetConfig ? { ...presetConfig } : null;
}

export function getJobClusterSettingSummary(settings = createDefaultJobClusterSettings()) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const option = JOB_CLUSTER_PRESET_OPTIONS.find(
    (presetOption) => presetOption.value === normalizedSettings.preset
  );

  return option ? `Radius: ${option.label}` : "Radius: Medium";
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
