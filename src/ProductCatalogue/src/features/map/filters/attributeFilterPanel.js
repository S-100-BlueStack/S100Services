import "@esri/calcite-components/components/calcite-slider";

import { formatAttributeDisplayValue } from "../attributes/attributeDisplay.js";
import { setDisplayScaleHidingDisabled } from "../scale/displayScaleOverrideState.js";
import {
  PREFERENCE_PERSISTENCE_KEY,
  isPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../../preferences/state/preferencePersistenceState.js";
import {
  getAttributeFilterFieldDefinition,
  getAttributeFilterFieldLabel,
} from "./attributeFilterConfig.js";
import {
  readAttributeFilterSnapshot,
  removeAttributeFilterSnapshot,
  writeAttributeFilterSnapshot,
} from "./attributeFilterPersistence.js";

const POPOVER_ID = "filters";

export function initAttributeFilterPanel({
  filterService,
  applyVisibility,
  navbarPopoverCoordinator,
} = {}) {
  const button = document.getElementById("filter-button");
  const badge = document.getElementById("filter-count");

  if (!button) {
    return createEmptyApi();
  }

  const panel = document.createElement("section");
  panel.id = "attribute-filter-panel";
  panel.className = "pc-filter-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Product filters");
  document.body.append(panel);

  let hasInitializedFilterState = false;
  let wasDisplayScaleFilterActive = false;
  let renderScheduled = false;

  const isOpen = () => !panel.hidden;

  function initializeFilterStateIfNeeded(providerIds) {
    if (hasInitializedFilterState || providerIds.length === 0) {
      return false;
    }

    if (isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS)) {
      const saved = readSavedFilterSnapshot();

      if (saved.exists && filterService.applyFilterSnapshot(saved.snapshot)) {
        // Canonicalize migrated state immediately. The service includes pending
        // compatibility state so this is independent of provider startup order.
        writeFilterSnapshot(filterService);
        hasInitializedFilterState = true;
        return true;
      }

      if (saved.exists) {
        removeSavedFilterSnapshot();
      }
    }

    // Provider defaults are applied declaratively by the service. Persisting the
    // initial snapshot keeps source and filter first-visit state as separate contracts.
    writeFilterSnapshot(filterService);
    hasInitializedFilterState = true;
    return true;
  }

  function setOpen(open, { restoreFocus = false, focusInitial = true } = {}) {
    const nextOpen = Boolean(open);
    panel.hidden = !nextOpen;
    button.toggleAttribute("active", nextOpen);
    button.setAttribute("aria-expanded", String(nextOpen));

    if (nextOpen) {
      render();
      positionPanel(button, panel);

      if (focusInitial) {
        panel.querySelector("button, input, calcite-slider")?.focus?.();
      }
    } else if (restoreFocus) {
      button.focus();
    }

    return true;
  }

  const unregisterPopover = navbarPopoverCoordinator?.register?.(POPOVER_ID, {
    open: (options) => setOpen(true, options),
    close: (options) => setOpen(false, options),
    isOpen,
    containsTarget: (target) =>
      target instanceof Node && (panel.contains(target) || button.contains(target)),
  });

  function close(options = {}) {
    if (!isOpen()) {
      return false;
    }

    return navbarPopoverCoordinator
      ? navbarPopoverCoordinator.close(POPOVER_ID, options)
      : setOpen(false, options);
  }

  function clearAllFilters() {
    filterService.clearAll();
    writeFilterSnapshot(filterService);
    syncDisplayScaleFilterAutoDisable();
    applyVisibility?.();
    render();
  }

  function render() {
    renderScheduled = false;
    const providerIds = filterService.getLayerIds();
    const initializedNow = initializeFilterStateIfNeeded(providerIds);
    const openFieldKeys = getOpenFieldKeys(panel);

    panel.innerHTML = `
      <div class="pc-filter-panel__header">
        <div>
          <h2>Filters</h2>
          <p>Filter each active data source independently.</p>
        </div>
        <button type="button" data-clear-all-filters>Clear all</button>
      </div>
      <div class="pc-filter-panel__body">
        ${
          providerIds.length
            ? providerIds
                .map((providerId) => renderProvider(filterService, providerId, openFieldKeys))
                .join("")
            : '<p class="pc-filter-empty">No active filterable data sources.</p>'
        }
      </div>
    `;

    refreshBadge();

    if (initializedNow) {
      syncDisplayScaleFilterAutoDisable();
      applyVisibility?.();
    }
  }

  function scheduleRender({ persist = false } = {}) {
    if (persist && hasInitializedFilterState) {
      writeFilterSnapshot(filterService);
    }

    if (renderScheduled) {
      return;
    }

    renderScheduled = true;
    queueMicrotask(() => {
      if (renderScheduled) {
        render();
      }
    });
  }

  function commitFilterChange({ rerender = true } = {}) {
    writeFilterSnapshot(filterService);
    syncDisplayScaleFilterAutoDisable();
    applyVisibility?.();

    if (rerender) {
      render();
    } else {
      refreshBadge();
    }
  }

  function refreshBadge() {
    if (!badge) {
      return;
    }

    const activeCount = filterService.getActiveFilterCount();
    badge.hidden = activeCount === 0;
    badge.textContent = String(activeCount);
  }

  function syncDisplayScaleFilterAutoDisable() {
    const active = filterService.hasActiveDisplayScaleFilter();

    if (active && !wasDisplayScaleFilterActive) {
      setDisplayScaleHidingDisabled(true, { source: "displayScaleFilter" });
    }

    wasDisplayScaleFilterActive = active;
  }

  function handleButtonClick(event) {
    event.stopPropagation();

    if (navbarPopoverCoordinator) {
      navbarPopoverCoordinator.toggle(POPOVER_ID);
    } else {
      setOpen(!isOpen());
    }
  }

  function handlePanelChange(event) {
    const checkbox = getTargetElement(event)?.closest("[data-filter-checkbox]");

    if (!checkbox) {
      return;
    }

    const { providerId, fieldName } = checkbox.dataset;
    const values = filterService.getValuesForField(providerId, fieldName);
    const selectedValues = getCheckedValues(panel, providerId, fieldName);
    filterService.setFilter(providerId, fieldName, selectedValues, values.length);
    commitFilterChange();
  }

  function handleSliderInput(event) {
    const slider = getTargetElement(event)?.closest("calcite-slider[data-filter-range]");

    if (!slider) {
      return;
    }

    updateRangePreview(panel, filterService, slider.dataset.providerId, slider.dataset.fieldName);
  }

  function handleSliderChange(event) {
    const slider = getTargetElement(event)?.closest("calcite-slider[data-filter-range]");

    if (!slider) {
      return;
    }

    const values = getNumericEntries(
      filterService.getValuesForField(slider.dataset.providerId, slider.dataset.fieldName)
    );

    if (values.length < 2) {
      return;
    }

    const maxIndex = values.length - 1;
    const firstIndex = clampIndex(slider.minValue, maxIndex);
    const secondIndex = clampIndex(slider.maxValue, maxIndex);
    const minIndex = Math.min(firstIndex, secondIndex);
    const maxSelectedIndex = Math.max(firstIndex, secondIndex);

    filterService.setRangeFilter(
      slider.dataset.providerId,
      slider.dataset.fieldName,
      values[minIndex].numericValue,
      values[maxSelectedIndex].numericValue,
      values[0].numericValue,
      values[maxIndex].numericValue
    );
    commitFilterChange({ rerender: false });
    updateRangePreview(panel, filterService, slider.dataset.providerId, slider.dataset.fieldName);
  }

  function handlePanelClick(event) {
    event.stopPropagation();
    const target = getTargetElement(event);

    if (!target) {
      return;
    }

    if (target.closest("[data-clear-all-filters]")) {
      clearAllFilters();
      return;
    }

    const selectButton = target.closest("[data-select-field]");
    if (selectButton) {
      filterService.clearFilter(selectButton.dataset.providerId, selectButton.dataset.fieldName);
      commitFilterChange();
      return;
    }

    const clearButton = target.closest("[data-clear-field]");
    if (clearButton) {
      const values = filterService.getValuesForField(
        clearButton.dataset.providerId,
        clearButton.dataset.fieldName
      );
      filterService.setFilter(
        clearButton.dataset.providerId,
        clearButton.dataset.fieldName,
        [],
        values.length
      );
      commitFilterChange();
      return;
    }

    const resetRangeButton = target.closest("[data-reset-range]");
    if (resetRangeButton) {
      filterService.clearFilter(
        resetRangeButton.dataset.providerId,
        resetRangeButton.dataset.fieldName
      );
      commitFilterChange();
    }
  }

  function handleDocumentClick(event) {
    const target = getTargetElement(event);

    if (!target || !isOpen() || panel.contains(target) || button.contains(target)) {
      return;
    }

    setOpen(false);
  }

  function handleKeydown(event) {
    if (event.key !== "Escape" || event.defaultPrevented || !isOpen()) {
      return;
    }

    setOpen(false, { restoreFocus: true });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleResize() {
    if (isOpen()) {
      positionPanel(button, panel);
    }
  }

  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", panel.id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", handleButtonClick);
  panel.addEventListener("change", handlePanelChange);
  panel.addEventListener("calciteSliderInput", handleSliderInput);
  panel.addEventListener("calciteSliderChange", handleSliderChange);
  panel.addEventListener("click", handlePanelClick);

  if (!navbarPopoverCoordinator) {
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeydown, true);
  }

  window.addEventListener("resize", handleResize);

  const persistenceHandle = onPreferencePersistenceChanged(({ key, enabled }) => {
    if (key !== PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS) {
      return;
    }

    if (enabled) {
      writeFilterSnapshot(filterService);
    } else {
      removeSavedFilterSnapshot();
    }
  });
  const unsubscribeFilters = filterService.subscribe((detail) => {
    const providerChanged =
      detail.type === "provider-added" ||
      detail.type === "provider-replaced" ||
      detail.type === "provider-removed" ||
      detail.type === "provider-suspended";

    if (!providerChanged) {
      return;
    }

    const isTemporarySuspension = detail.type === "provider-suspended";
    scheduleRender({
      persist:
        !isTemporarySuspension && (detail.type === "provider-removed" || hasInitializedFilterState),
    });
    applyVisibility?.();
  });

  render();

  return {
    isOpen,
    refresh: render,
    close,
    clearAllFilters,
    destroy() {
      persistenceHandle?.remove?.();
      unsubscribeFilters();
      unregisterPopover?.();
      button.removeEventListener("click", handleButtonClick);
      panel.removeEventListener("change", handlePanelChange);
      panel.removeEventListener("calciteSliderInput", handleSliderInput);
      panel.removeEventListener("calciteSliderChange", handleSliderChange);
      panel.removeEventListener("click", handlePanelClick);

      if (!navbarPopoverCoordinator) {
        document.removeEventListener("click", handleDocumentClick);
        document.removeEventListener("keydown", handleKeydown, true);
      }

      window.removeEventListener("resize", handleResize);
      panel.remove();
      button.toggleAttribute("active", false);
      button.setAttribute("aria-expanded", "false");
    },
  };
}

function renderProvider(filterService, providerId, openFieldKeys) {
  const metadata = filterService.getLayerMetadata(providerId);
  const fields = filterService.getFilterableFields(providerId);
  const countText = metadata
    ? `${metadata.visibleCount} of ${metadata.totalCount} visible`
    : "No products loaded";

  return `
    <section class="pc-filter-layer" data-filter-provider="${escapeHtml(providerId)}">
      <h3>${escapeHtml(metadata?.label ?? providerId)}</h3>
      <p class="pc-filter-empty">${escapeHtml(countText)}</p>
      ${
        fields.length
          ? fields
              .map((fieldName) => renderField(filterService, providerId, fieldName, openFieldKeys))
              .join("")
          : '<p class="pc-filter-empty">No supported filter attributes found.</p>'
      }
    </section>
  `;
}

function renderField(filterService, providerId, fieldName, openFieldKeys) {
  const values = filterService.getValuesForField(providerId, fieldName);

  if (values.length === 0) {
    return "";
  }

  const definition = getAttributeFilterFieldDefinition(fieldName);
  return definition?.mode === "range" && getNumericEntries(values).length >= 2
    ? renderRangeField(filterService, providerId, fieldName, values, openFieldKeys)
    : renderCheckboxField(filterService, providerId, fieldName, values, openFieldKeys);
}

function renderCheckboxField(filterService, providerId, fieldName, values, openFieldKeys) {
  const selectedValues = filterService.getSelectedValues(providerId, fieldName);
  const selectedCount = selectedValues
    ? values.filter((entry) => selectedValues.has(entry.value)).length
    : values.length;
  const isOpen = openFieldKeys.has(getFieldKey(providerId, fieldName));

  return `
    <details
      class="pc-filter-field"
      data-provider-id="${escapeHtml(providerId)}"
      data-field-name="${escapeHtml(fieldName)}"
      ${isOpen ? "open" : ""}
    >
      <summary>
        <span>${escapeHtml(getAttributeFilterFieldLabel(fieldName))}</span>
        <span class="pc-filter-field__summary">${selectedCount}/${values.length}</span>
      </summary>
      <div class="pc-filter-field__actions">
        <button
          type="button"
          data-select-field
          data-provider-id="${escapeHtml(providerId)}"
          data-field-name="${escapeHtml(fieldName)}"
        >Select all</button>
        <button
          type="button"
          data-clear-field
          data-provider-id="${escapeHtml(providerId)}"
          data-field-name="${escapeHtml(fieldName)}"
        >Clear</button>
      </div>
      <div class="pc-filter-options">
        ${values
          .map(
            (entry) => `
              <label class="pc-filter-option ${entry.count === 0 ? "pc-filter-option--empty" : ""}">
                <input
                  type="checkbox"
                  data-filter-checkbox
                  data-provider-id="${escapeHtml(providerId)}"
                  data-field-name="${escapeHtml(fieldName)}"
                  data-filter-value="${escapeHtml(entry.value)}"
                  ${!selectedValues || selectedValues.has(entry.value) ? "checked" : ""}
                />
                <span class="pc-filter-option__label">${escapeHtml(
                  formatAttributeDisplayValue(fieldName, entry.value, entry.label)
                )}</span>
                <span class="pc-filter-option__count">${entry.count}</span>
              </label>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderRangeField(filterService, providerId, fieldName, values, openFieldKeys) {
  const entries = getNumericEntries(values);
  const range = filterService.getRangeFilter(providerId, fieldName);
  const minIndex = range ? findMinIndex(entries, range.min) : 0;
  const maxIndex = range ? findMaxIndex(entries, range.max) : entries.length - 1;
  const state = getRangeState(entries, minIndex, maxIndex, fieldName);
  const isOpen = openFieldKeys.has(getFieldKey(providerId, fieldName));

  return `
    <details
      class="pc-filter-field"
      data-provider-id="${escapeHtml(providerId)}"
      data-field-name="${escapeHtml(fieldName)}"
      ${isOpen ? "open" : ""}
    >
      <summary>
        <span>${escapeHtml(getAttributeFilterFieldLabel(fieldName))}</span>
        <span class="pc-filter-field__summary" data-range-summary>
          ${state.selectedValueCount}/${values.length}
        </span>
      </summary>
      <div class="pc-filter-field__actions">
        <button
          type="button"
          data-reset-range
          data-provider-id="${escapeHtml(providerId)}"
          data-field-name="${escapeHtml(fieldName)}"
        >Reset</button>
      </div>
      <div
        class="pc-filter-range"
        data-range-values
        data-provider-id="${escapeHtml(providerId)}"
        data-field-name="${escapeHtml(fieldName)}"
      >
        <div class="pc-filter-range__values">
          <output data-range-output="min">${escapeHtml(state.minLabel)}</output>
          <output data-range-output="max">${escapeHtml(state.maxLabel)}</output>
        </div>
        <calcite-slider
          data-filter-range
          data-provider-id="${escapeHtml(providerId)}"
          data-field-name="${escapeHtml(fieldName)}"
          min="0"
          max="${entries.length - 1}"
          min-value="${state.minIndex}"
          max-value="${state.maxIndex}"
          step="1"
          scale="s"
          label-handles
          ticks="0"
        ></calcite-slider>
        <div class="pc-filter-range__hint" data-range-hint>
          ${state.featureCount} product(s) in range
        </div>
      </div>
    </details>
  `;
}

function updateRangePreview(panel, filterService, providerId, fieldName) {
  const entries = getNumericEntries(filterService.getValuesForField(providerId, fieldName));
  const slider = panel.querySelector(
    `calcite-slider[data-provider-id="${CSS.escape(
      providerId
    )}"][data-field-name="${CSS.escape(fieldName)}"]`
  );

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
  const field = slider.closest(".pc-filter-field");

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

function getRangeState(entries, minIndex, maxIndex, fieldName) {
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

function getNumericEntries(values) {
  return values
    .map((entry) => ({ ...entry, numericValue: Number(entry.value) }))
    .filter((entry) => Number.isFinite(entry.numericValue))
    .sort((left, right) => left.numericValue - right.numericValue);
}

function findMinIndex(entries, value) {
  const index = entries.findIndex((entry) => entry.numericValue >= value);
  return index < 0 ? 0 : index;
}

function findMaxIndex(entries, value) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].numericValue <= value) {
      return index;
    }
  }

  return entries.length - 1;
}

function clampIndex(value, max) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : 0, 0), max);
}

function getCheckedValues(panel, providerId, fieldName) {
  return [
    ...panel.querySelectorAll(
      `[data-filter-checkbox][data-provider-id="${CSS.escape(
        providerId
      )}"][data-field-name="${CSS.escape(fieldName)}"]`
    ),
  ]
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.dataset.filterValue);
}

function getOpenFieldKeys(panel) {
  return new Set(
    [...panel.querySelectorAll(".pc-filter-field[open]")].map((details) =>
      getFieldKey(details.dataset.providerId, details.dataset.fieldName)
    )
  );
}

function getFieldKey(providerId, fieldName) {
  return `${providerId}:${fieldName}`;
}

function positionPanel(button, panel) {
  const rect = button.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
}

function readSavedFilterSnapshot() {
  const result = readAttributeFilterSnapshot();
  if (result.error) {
    console.warn("Failed to read saved attribute filters.", result.error);
  }
  return result;
}

function writeFilterSnapshot(filterService) {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS)) {
    return;
  }

  const result = writeAttributeFilterSnapshot(filterService);
  if (result.error) {
    console.warn("Failed to save attribute filters.", result.error);
  }
}

function removeSavedFilterSnapshot() {
  const result = removeAttributeFilterSnapshot();
  if (result.error) {
    console.warn("Failed to remove saved attribute filters.", result.error);
  }
}

function getTargetElement(event) {
  return event.target instanceof Element ? event.target : null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function createEmptyApi() {
  return {
    isOpen: () => false,
    refresh() {},
    close: () => false,
    clearAllFilters() {},
    destroy() {},
  };
}
