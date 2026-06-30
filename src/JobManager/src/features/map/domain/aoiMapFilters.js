export const AOI_MAP_FILTER_MODE = Object.freeze({
  ALL: "all",
  WITH_VISIBLE_JOBS: "withVisibleJobs",
  WITH_ACTIVE_JOBS: "withActiveJobs",
  WITH_HIGH_PRIORITY_JOBS: "withHighPriorityJobs",
});

const AOI_MAP_FILTER_MODE_VALUES = new Set(Object.values(AOI_MAP_FILTER_MODE));

export const AOI_MAP_FILTER_MODE_OPTIONS = Object.freeze([
  Object.freeze({
    value: AOI_MAP_FILTER_MODE.ALL,
    label: "All AOIs",
    description: "Show all Areas of Interest.",
  }),
  Object.freeze({
    value: AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS,
    label: "AOIs with visible Jobs",
    description: "Show AOIs that have Jobs in the current visible Job set.",
  }),
  Object.freeze({
    value: AOI_MAP_FILTER_MODE.WITH_ACTIVE_JOBS,
    label: "AOIs with active Jobs",
    description: "Show AOIs that have related Jobs that are not Done.",
  }),
  Object.freeze({
    value: AOI_MAP_FILTER_MODE.WITH_HIGH_PRIORITY_JOBS,
    label: "AOIs with high-priority Jobs",
    description: "Show AOIs that have active high-priority Jobs.",
  }),
]);

export function createDefaultAoiMapFilters() {
  return {
    mode: AOI_MAP_FILTER_MODE.ALL,
  };
}

export function normalizeAoiMapFilters(filters = createDefaultAoiMapFilters()) {
  const source = filters && typeof filters === "object" ? filters : {};
  const mode = normalizeOptionalString(source.mode);

  return {
    mode: AOI_MAP_FILTER_MODE_VALUES.has(mode) ? mode : AOI_MAP_FILTER_MODE.ALL,
  };
}

export function hasActiveAoiMapFilters(filters = createDefaultAoiMapFilters()) {
  return normalizeAoiMapFilters(filters).mode !== AOI_MAP_FILTER_MODE.ALL;
}

export function getAoiMapFilterSummary(filters = createDefaultAoiMapFilters()) {
  const normalizedFilters = normalizeAoiMapFilters(filters);
  const option = AOI_MAP_FILTER_MODE_OPTIONS.find((item) => item.value === normalizedFilters.mode);

  return option?.label ?? "All AOIs";
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
