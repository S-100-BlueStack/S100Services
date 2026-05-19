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

function getTargetElement(event) {
  return event.target instanceof Element ? event.target : null;
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

function renderField({ filterService, layerId, fieldName, openFieldKeys }) {
  const values = filterService.getValuesForField(layerId, fieldName);
  const selectedValues = filterService.getSelectedValues(layerId, fieldName);

  if (!values.length) {
    return "";
  }

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
                <span class="pm-filter-value__label">${escapeHtml(entry.label)}</span>
                <span class="pm-filter-value__count">${entry.count}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </details>
  `;
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

  document.body.append(panel);

  function isOpen() {
    return !panel.hidden;
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
  }

  function updateFieldFilter(layerId, fieldName) {
    const values = filterService.getValuesForField(layerId, fieldName);
    const selectedValues = getCheckedValues(panel, layerId, fieldName);

    filterService.setFilter(layerId, fieldName, selectedValues, values.length);
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
