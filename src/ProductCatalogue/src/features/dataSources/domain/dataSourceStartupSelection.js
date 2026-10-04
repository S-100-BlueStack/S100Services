export function resolveStartupDataSourceSelection({
  persistedSelection,
  runtimeSelectableSources = [],
  defaultEnabledSourceIds = [],
} = {}) {
  const restoredEnabledSourceIds = Array.isArray(persistedSelection?.enabledSourceIds)
    ? [...persistedSelection.enabledSourceIds]
    : [];
  const isExplicitRestoredSelection =
    persistedSelection?.status === "valid" && persistedSelection?.isFirstVisit === false;

  if (!isExplicitRestoredSelection || restoredEnabledSourceIds.length > 0) {
    return {
      enabledSourceIds: restoredEnabledSourceIds,
      fallbackSourceId: null,
      recoveredFromEmpty: false,
    };
  }

  const defaultIds = new Set(defaultEnabledSourceIds);
  const fallbackSources = runtimeSelectableSources.filter(
    (source) => source.persistence?.persistSelection !== false
  );
  const fallbackSource =
    fallbackSources.find((source) => defaultIds.has(source.id)) ?? fallbackSources[0] ?? null;

  return {
    enabledSourceIds: fallbackSource ? [fallbackSource.id] : [],
    fallbackSourceId: fallbackSource?.id ?? null,
    recoveredFromEmpty: Boolean(fallbackSource),
  };
}
