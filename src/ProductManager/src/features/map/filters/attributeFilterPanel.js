import "@esri/calcite-components/components/calcite-slider";
import { formatAttributeDisplayValue } from "../attributes/attributeDisplay.js";
import { ATTRIBUTE_FILTER_CONFIG } from "./attributeFilterConfig.js";
function readSavedFilterSnapshot() {
  try {
    const rawValue = window.localStorage.getItem(ATTRIBUTE_FILTER_CONFIG.storageKey);

    if (rawValue === null) {
      return {
        exists: false,
        snapshot: null,
      };
    }

    return {
      exists: true,
      snapshot: JSON.parse(rawValue),
    };
  } catch (error) {
    console.warn("Failed to read saved attribute filters.", error);

    return {
      exists: false,
      snapshot: null,
    };
  }
}

function writeFilterSnapshot(filterService) {
  try {
    window.localStorage.setItem(
      ATTRIBUTE_FILTER_CONFIG.storageKey,
      JSON.stringify(filterService.getFilterSnapshot())
    );
  } catch (error) {
    console.warn("Failed to save attribute filters.", error);
  }
}

function removeSavedFilterSnapshot() {
  try {
    window.localStorage.removeItem(ATTRIBUTE_FILTER_CONFIG.storageKey);
  } catch (error) {
    console.warn("Failed to remove saved attribute filters.", error);
  }
}

function applyDefaultFilterState(filterService) {
  let didApplyDefault = false;

  for (const layerId of filterService.getLayerIds()) {
    const fieldNames = new Set(filterService.getFilterableFields(layerId));

    for (const defaultFilter of getDefaultExcludedValues(layerId)) {
      if (!fieldNames.has(defaultFilter.fieldName)) {
        continue;
      }

      const values = filterService.getValuesForField(layerId, defaultFilter.fieldName);
      const excludedValues = new Set(defaultFilter.values.map(String));

      if (!values.some((entry) => excludedValues.has(entry.value))) {
        continue;
      }

      const selectedValues = values
        .filter((entry) => !excludedValues.has(entry.value))
        .map((entry) => entry.value);

      filterService.setFilter(layerId, defaultFilter.fieldName, selectedValues, values.length);
      didApplyDefault = true;
    }
  }

  return didApplyDefault;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}

function getLayerFilterConfig(layerId) {
  return ATTRIBUTE_FILTER_CONFIG.layers?.[layerId] ?? {};
}

function getRangeFilterFields(layerId) {
  return (
    getLayerFilterConfig(layerId).rangeFilterFields ??
    ATTRIBUTE_FILTER_CONFIG.global?.rangeFilterFields ??
    new Set()
  );
}

function getDefaultExcludedValues(layerId) {
  return (
    getLayerFilterConfig(layerId).defaultExcludedValues ??
    ATTRIBUTE_FILTER_CONFIG.global?.defaultExcludedValues ??
    []
  );
}

function getTargetElement(event) {
  return event.target instanceof Element ? event.target : null;
}

function getFieldKey(layerId, fieldName) {
  return `${layerId}:${fieldName}`;
}

function getOpenFieldKeys(panel) {
  return new Set(
    Array.from(panel.querySelectorAll(".pm-filter-field[open]")).map((details) =>
      getFieldKey(details.dataset.layerId, details.dataset.fieldName)
    )
  );
}

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getCheckedValues(panel, layerId, fieldName) {
  return Array.from(
    panel.querySelectorAll(
      `[data-filter-checkbox][data-layer-id="${CSS.escape(layerId)}"][data-field-name="${CSS.escape(fieldName)}"]`
    )
  )
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.dataset.filterValue);
}

function getNumericEntries(values) {
  return values
    .map((entry) => ({
      ...entry,
      numericValue: toFiniteNumber(entry.value),
    }))
    .filter((entry) => entry.numericValue !== null)
    .sort((a, b) => a.numericValue - b.numericValue);
}

function getRangeIndexForMin(entries, minValue) {
  const index = entries.findIndex((entry) => entry.numericValue >= minValue);

  return index === -1 ? 0 : index;
}

function getRangeIndexForMax(entries, maxValue) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].numericValue <= maxValue) {
      return index;
    }
  }

  return entries.length - 1;
}

function clampRangeIndex(value, maxIndex) {
  const index = Number(value);

  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.min(Math.max(index, 0), maxIndex);
}

function getRangeInput(panel, layerId, fieldName, bound) {
  return panel.querySelector(
    `[data-filter-range][data-layer-id="${CSS.escape(layerId)}"][data-field-name="${CSS.escape(fieldName)}"][data-range-bound="${bound}"]`
  );
}

function getRangeSlider(panel, layerId, fieldName) {
  return panel.querySelector(
    `calcite-slider[data-filter-range][data-layer-id="${CSS.escape(layerId)}"][data-field-name="${CSS.escape(fieldName)}"]`
  );
}

function getRangeUiState({ entries, minIndex, maxIndex, fieldName }) {
  const rangeMax = entries.length - 1;
  const normalizedMinIndex = Math.min(minIndex, maxIndex);
  const normalizedMaxIndex = Math.max(minIndex, maxIndex);

  const selectedEntries = entries.filter(
    (entry) =>
      entry.numericValue >= entries[normalizedMinIndex].numericValue &&
      entry.numericValue <= entries[normalizedMaxIndex].numericValue
  );

  const featureCount = selectedEntries.reduce((sum, entry) => sum + entry.count, 0);

  return {
    normalizedMinIndex,
    normalizedMaxIndex,
    selectedValueCount: selectedEntries.length,
    featureCount,
    startPercent: rangeMax === 0 ? 0 : (normalizedMinIndex / rangeMax) * 100,
    endPercent: rangeMax === 0 ? 100 : (normalizedMaxIndex / rangeMax) * 100,
    minDisplayValue: formatAttributeDisplayValue(
      fieldName,
      entries[normalizedMinIndex].value,
      entries[normalizedMinIndex].label
    ),
    maxDisplayValue: formatAttributeDisplayValue(
      fieldName,
      entries[normalizedMaxIndex].value,
      entries[normalizedMaxIndex].label
    ),
  };
}

function updateRangePreview(panel, filterService, layerId, fieldName) {
  const values = filterService.getValuesForField(layerId, fieldName);
  const entries = getNumericEntries(values);

  if (entries.length < 2) {
    return;
  }

  const slider = getRangeSlider(panel, layerId, fieldName);

  if (!slider) {
    return;
  }

  const rangeMax = entries.length - 1;
  const state = getRangeUiState({
    entries,
    minIndex: clampRangeIndex(slider.minValue, rangeMax),
    maxIndex: clampRangeIndex(slider.maxValue, rangeMax),
    fieldName,
  });

  const rangeElement = panel.querySelector(
    `[data-range-values][data-layer-id="${CSS.escape(layerId)}"][data-field-name="${CSS.escape(fieldName)}"]`
  );

  if (!rangeElement) {
    return;
  }

  const minOutput = rangeElement.querySelector('[data-range-output="min"]');
  const maxOutput = rangeElement.querySelector('[data-range-output="max"]');
  const hint = rangeElement.querySelector("[data-range-hint]");
  const summary = rangeElement.closest(".pm-filter-field")?.querySelector("[data-range-summary]");

  if (minOutput) {
    minOutput.textContent = state.minDisplayValue;
  }

  if (maxOutput) {
    maxOutput.textContent = state.maxDisplayValue;
  }

  if (hint) {
    hint.textContent = `${state.featureCount} feature(s) in range`;
  }

  if (summary) {
    summary.textContent = `${state.selectedValueCount}/${values.length}`;
  }
}

function shouldRenderRangeFilter(layerId, fieldName, values) {
  if (!getRangeFilterFields(layerId).has(fieldName)) {
    return false;
  }

  return getNumericEntries(values).length >= 2;
}

function renderCheckboxField({ filterService, layerId, fieldName, values, openFieldKeys }) {
  const selectedValues = filterService.getSelectedValues(layerId, fieldName);

  const selectedCount = selectedValues
    ? values.filter((entry) => selectedValues.has(entry.value)).length
    : values.length;

  const isOpen = openFieldKeys.has(getFieldKey(layerId, fieldName));

  return `
    <details
      class="pm-filter-field"
      data-layer-id="${escapeHtml(layerId)}"
      data-field-name="${escapeHtml(fieldName)}"
      ${isOpen ? "open" : ""}
    >
      <summary>
        <span>${escapeHtml(fieldName)}</span>
        <span class="pm-filter-field__summary">${selectedCount}/${values.length}</span>
      </summary>

      <div class="pm-filter-field__actions">
        <button type="button" data-select-field data-layer-id="${escapeHtml(layerId)}" data-field-name="${escapeHtml(fieldName)}">
          Select all
        </button>
        <button type="button" data-clear-field data-layer-id="${escapeHtml(layerId)}" data-field-name="${escapeHtml(fieldName)}">
          Clear
        </button>
      </div>

      <div class="pm-filter-values">
        ${values
          .map((entry) => {
            const checked = !selectedValues || selectedValues.has(entry.value);
            const displayLabel = formatAttributeDisplayValue(fieldName, entry.value, entry.label);

            return `
              <label class="pm-filter-value">
                <input
                  type="checkbox"
                  data-filter-checkbox
                  data-layer-id="${escapeHtml(layerId)}"
                  data-field-name="${escapeHtml(fieldName)}"
                  data-filter-value="${escapeHtml(entry.value)}"
                  ${checked ? "checked" : ""}
                />
                <span class="pm-filter-value__label">${escapeHtml(displayLabel)}</span>
                <span class="pm-filter-value__count">${entry.count}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </details>
  `;
}

function renderRangeField({ filterService, layerId, fieldName, values, openFieldKeys }) {
  const entries = getNumericEntries(values);
  const rangeFilter = filterService.getRangeFilter(layerId, fieldName);

  const fullMinValue = entries[0].numericValue;
  const fullMaxValue = entries[entries.length - 1].numericValue;

  const minIndex = rangeFilter ? getRangeIndexForMin(entries, rangeFilter.min) : 0;
  const maxIndex = rangeFilter ? getRangeIndexForMax(entries, rangeFilter.max) : entries.length - 1;

  const state = getRangeUiState({
    entries,
    minIndex,
    maxIndex,
    fieldName,
  });

  const isOpen = openFieldKeys.has(getFieldKey(layerId, fieldName));
  const rangeMax = entries.length - 1;

  return `
    <details
      class="pm-filter-field"
      data-layer-id="${escapeHtml(layerId)}"
      data-field-name="${escapeHtml(fieldName)}"
      ${isOpen ? "open" : ""}
    >
      <summary>
        <span>${escapeHtml(fieldName)}</span>
        <span class="pm-filter-field__summary" data-range-summary>
          ${state.selectedValueCount}/${values.length}
        </span>
      </summary>

      <div class="pm-filter-field__actions">
        <button type="button" data-reset-range data-layer-id="${escapeHtml(layerId)}" data-field-name="${escapeHtml(fieldName)}">
          Reset
        </button>
      </div>

      <div
        class="pm-filter-range"
        data-range-values
        data-layer-id="${escapeHtml(layerId)}"
        data-field-name="${escapeHtml(fieldName)}"
        data-full-min-value="${escapeHtml(fullMinValue)}"
        data-full-max-value="${escapeHtml(fullMaxValue)}"
      >
        <div class="pm-filter-range__values">
          <output data-range-output="min">${escapeHtml(state.minDisplayValue)}</output>
          <output data-range-output="max">${escapeHtml(state.maxDisplayValue)}</output>
        </div>

        <calcite-slider
  data-filter-range
  data-layer-id="${escapeHtml(layerId)}"
  data-field-name="${escapeHtml(fieldName)}"
  min="0"
  max="${rangeMax}"
  step="1"
  min-value="${state.normalizedMinIndex}"
  max-value="${state.normalizedMaxIndex}"
  min-label="${escapeHtml(fieldName)} lower bound"
  max-label="${escapeHtml(fieldName)} upper bound"
  scale="s"
  snap
></calcite-slider>

        <div class="pm-filter-range__hint" data-range-hint>
          ${state.featureCount} feature(s) in range
        </div>
      </div>
    </details>
  `;
}

function renderField({ filterService, layerId, fieldName, openFieldKeys }) {
  const values = filterService.getValuesForField(layerId, fieldName);

  if (!values.length) {
    return "";
  }

  if (shouldRenderRangeFilter(layerId, fieldName, values)) {
    return renderRangeField({
      filterService,
      layerId,
      fieldName,
      values,
      openFieldKeys,
    });
  }

  return renderCheckboxField({
    filterService,
    layerId,
    fieldName,
    values,
    openFieldKeys,
  });
}

function renderLayer({ filterService, layerId, openFieldKeys }) {
  const fields = filterService.getFilterableFields(layerId);

  if (!fields.length) {
    return `
      <section class="pm-filter-layer">
        <h3>${escapeHtml(layerId)}</h3>
        <p class="pm-filter-empty">No filterable attributes found.</p>
      </section>
    `;
  }

  return `
    <section class="pm-filter-layer">
      <h3>${escapeHtml(layerId)}</h3>

      ${fields
        .map((fieldName) =>
          renderField({
            filterService,
            layerId,
            fieldName,
            openFieldKeys,
          })
        )
        .join("")}
    </section>
  `;
}

export function initAttributeFilterPanel({ filterService, applyVisibility }) {
  const button = document.getElementById("filter-button");
  const badge = document.getElementById("filter-count");

  if (!button) {
    return {
      refresh() {},
      close() {},
    };
  }

  const panel = document.createElement("section");
  panel.id = "attribute-filter-panel";
  panel.className = "pm-filter-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Attribute filters");

  let hasInitializedFilterState = false;

  document.body.append(panel);

  function isOpen() {
    return !panel.hidden;
  }

  function initializeFilterStateIfNeeded(layerIds) {
    if (hasInitializedFilterState || !layerIds.length) {
      return false;
    }

    const savedFilterState = readSavedFilterSnapshot();

    if (savedFilterState.exists) {
      const didApplySavedState = filterService.applyFilterSnapshot(savedFilterState.snapshot);

      if (didApplySavedState) {
        hasInitializedFilterState = true;
        return true;
      }

      removeSavedFilterSnapshot();
    }

    const didApplyDefault = applyDefaultFilterState(filterService);

    // Save the initial state so clearing all filters later does not cause
    // the default filter to reappear on the next page visit.
    writeFilterSnapshot(filterService);

    hasInitializedFilterState = true;

    return didApplyDefault;
  }

  function setOpen(open) {
    panel.hidden = !open;
    button.toggleAttribute("active", open);

    if (open) {
      render();
      positionPanel();
    }
  }

  function positionPanel() {
    const rect = button.getBoundingClientRect();

    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
  }

  function refreshBadge() {
    const activeCount = filterService.getActiveFilterCount();

    if (!badge) {
      return;
    }

    badge.hidden = activeCount === 0;
    badge.textContent = String(activeCount);
  }

  function render() {
    const layerIds = filterService.getLayerIds();
    const didInitializeFilterState = initializeFilterStateIfNeeded(layerIds);
    const openFieldKeys = getOpenFieldKeys(panel);

    panel.innerHTML = `
    <div class="pm-filter-panel__header">
      <div>
        <h2>Filters</h2>
        <p>Filter by layer attributes.</p>
      </div>

      <button type="button" class="pm-filter-clear-all" data-clear-all-filters>
        Clear all
      </button>
    </div>

    ${
      layerIds.length
        ? layerIds
            .map((layerId) =>
              renderLayer({
                filterService,
                layerId,
                openFieldKeys,
              })
            )
            .join("")
        : '<p class="pm-filter-empty">No layers loaded.</p>'
    }
  `;

    refreshBadge();
    if (didInitializeFilterState) {
      applyVisibility();
    }
  }

  function updateFieldFilter(layerId, fieldName) {
    const values = filterService.getValuesForField(layerId, fieldName);
    const selectedValues = getCheckedValues(panel, layerId, fieldName);

    filterService.setFilter(layerId, fieldName, selectedValues, values.length);
    writeFilterSnapshot(filterService);

    applyVisibility();
    render();
  }

  function updateRangeFilter(layerId, fieldName) {
    const values = filterService.getValuesForField(layerId, fieldName);
    const entries = getNumericEntries(values);

    if (entries.length < 2) {
      return;
    }

    const slider = getRangeSlider(panel, layerId, fieldName);

    if (!slider) {
      return;
    }

    const rangeMax = entries.length - 1;
    const minIndex = Math.min(
      clampRangeIndex(slider.minValue, rangeMax),
      clampRangeIndex(slider.maxValue, rangeMax)
    );
    const maxIndex = Math.max(
      clampRangeIndex(slider.minValue, rangeMax),
      clampRangeIndex(slider.maxValue, rangeMax)
    );

    filterService.setRangeFilter(
      layerId,
      fieldName,
      entries[minIndex].numericValue,
      entries[maxIndex].numericValue,
      entries[0].numericValue,
      entries[entries.length - 1].numericValue
    );

    filterService.setRangeFilter(
      layerId,
      fieldName,
      entries[minIndex].numericValue,
      entries[maxIndex].numericValue,
      entries[0].numericValue,
      entries[entries.length - 1].numericValue
    );

    writeFilterSnapshot(filterService);

    applyVisibility();
    render();
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!isOpen());
  });

  panel.addEventListener("change", (event) => {
    const target = getTargetElement(event);
    const checkbox = target?.closest("[data-filter-checkbox]");

    if (!checkbox) {
      return;
    }

    updateFieldFilter(checkbox.dataset.layerId, checkbox.dataset.fieldName);
  });

  panel.addEventListener("calciteSliderInput", (event) => {
    const target = getTargetElement(event);
    const slider = target?.closest("calcite-slider[data-filter-range]");

    if (!slider) {
      return;
    }

    updateRangePreview(panel, filterService, slider.dataset.layerId, slider.dataset.fieldName);
  });

  panel.addEventListener("calciteSliderChange", (event) => {
    const target = getTargetElement(event);
    const slider = target?.closest("calcite-slider[data-filter-range]");

    if (!slider) {
      return;
    }

    updateRangeFilter(slider.dataset.layerId, slider.dataset.fieldName);
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();

    const target = getTargetElement(event);

    if (!target) {
      return;
    }

    const clearAllButton = target.closest("[data-clear-all-filters]");

    if (clearAllButton) {
      filterService.clearAll();
      applyVisibility();
      render();
      return;
    }

    const selectFieldButton = target.closest("[data-select-field]");

    if (selectFieldButton) {
      filterService.clearFilter(
        selectFieldButton.dataset.layerId,
        selectFieldButton.dataset.fieldName
      );
      applyVisibility();
      render();
      return;
    }

    const clearFieldButton = target.closest("[data-clear-field]");

    if (clearFieldButton) {
      filterService.setFilter(
        clearFieldButton.dataset.layerId,
        clearFieldButton.dataset.fieldName,
        [],
        filterService.getValuesForField(
          clearFieldButton.dataset.layerId,
          clearFieldButton.dataset.fieldName
        ).length
      );
      applyVisibility();
      render();
      return;
    }

    const resetRangeButton = target.closest("[data-reset-range]");

    if (resetRangeButton) {
      filterService.clearFilter(
        resetRangeButton.dataset.layerId,
        resetRangeButton.dataset.fieldName
      );
      applyVisibility();
      render();
    }
  });

  document.addEventListener("click", (event) => {
    const target = getTargetElement(event);

    if (!target || panel.hidden) {
      return;
    }

    if (panel.contains(target) || button.contains(target)) {
      return;
    }

    setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (isOpen()) {
      positionPanel();
    }
  });

  render();

  return {
    refresh: render,
    close: () => setOpen(false),
  };
}
