import { formatAttributeDisplayValue } from "../attributes/attributeDisplay.js";

// Patch application-owned text and classes without replacing the active slider or moving focus.
export function refreshRenderedFilterCounts(panel, filterService) {
  for (const provider of panel.querySelectorAll("[data-filter-provider]")) {
    const metadata = filterService.getLayerMetadata(provider.dataset.filterProvider);
    provider
      .querySelector("[data-provider-count]")
      ?.replaceChildren(
        metadata
          ? `${metadata.visibleCount} of ${metadata.totalCount} visible`
          : "No products loaded"
      );
    for (const field of provider.querySelectorAll(".pc-filter-field")) {
      const { providerId, fieldName } = field.dataset;
      const values = new Map(
        filterService.getValuesForField(providerId, fieldName).map((entry) => [entry.value, entry])
      );
      for (const checkbox of field.querySelectorAll("[data-filter-checkbox]")) {
        const count = values.get(checkbox.dataset.filterValue)?.count ?? 0;
        const option = checkbox.closest(".pc-filter-option");
        option?.querySelector(".pc-filter-option__count")?.replaceChildren(String(count));
        option?.classList.toggle("pc-filter-option--empty", count === 0);
      }
      if (field.querySelector("calcite-slider[data-filter-range]")) {
        updateRangePreview(panel, filterService, providerId, fieldName);
      }
    }
  }
}

export function updateRangePreview(panel, filterService, providerId, fieldName) {
  const entries = getNumericEntries(filterService.getValuesForField(providerId, fieldName));
  const field = [...panel.querySelectorAll(".pc-filter-field")].find(
    (element) =>
      element.dataset.providerId === providerId && element.dataset.fieldName === fieldName
  );
  const slider = field?.querySelector("calcite-slider[data-filter-range]");

  if (entries.length < 2 || !slider) {
    return;
  }

  const state = getRangeState(
    entries,
    clampIndex(slider.minValue, entries.length - 1),
    clampIndex(slider.maxValue, entries.length - 1),
    fieldName
  );
  const container = slider.closest("[data-range-values]");

  if (container) {
    container.querySelector('[data-range-output="min"]')?.replaceChildren(state.minLabel);
    container.querySelector('[data-range-output="max"]')?.replaceChildren(state.maxLabel);
    container
      .querySelector("[data-range-hint]")
      ?.replaceChildren(`${state.featureCount} product(s) in range`);
  }

  field
    ?.querySelector("[data-range-summary]")
    ?.replaceChildren(`${state.selectedValueCount}/${entries.length}`);
}

export function getRangeState(entries, minIndex, maxIndex, fieldName) {
  const normalizedMin = Math.min(minIndex, maxIndex);
  const normalizedMax = Math.max(minIndex, maxIndex);
  const selected = entries.slice(normalizedMin, normalizedMax + 1);

  return {
    minIndex: normalizedMin,
    maxIndex: normalizedMax,
    selectedValueCount: selected.length,
    featureCount: selected.reduce((sum, entry) => sum + entry.count, 0),
    minLabel: formatAttributeDisplayValue(
      fieldName,
      entries[normalizedMin].value,
      entries[normalizedMin].label
    ),
    maxLabel: formatAttributeDisplayValue(
      fieldName,
      entries[normalizedMax].value,
      entries[normalizedMax].label
    ),
  };
}

export function getNumericEntries(values) {
  return values
    .map((entry) => ({ ...entry, numericValue: Number(entry.value) }))
    .filter((entry) => Number.isFinite(entry.numericValue))
    .sort((left, right) => left.numericValue - right.numericValue);
}

export function clampIndex(value, max) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : 0, 0), max);
}
