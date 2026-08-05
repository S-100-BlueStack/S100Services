import { getRuntimeSelectableDataSources } from "../config/dataSourceRegistry.js";

export function initDataSourcePanel({ registry, controller } = {}) {
  const button = document.getElementById("data-sources-button");
  const sources = getRuntimeSelectableDataSources(registry);

  if (!button || sources.length === 0) {
    if (button) {
      button.hidden = true;
    }
    return createEmptyApi();
  }

  button.hidden = false;

  const panel = document.createElement("section");
  panel.id = "data-source-panel";
  panel.className = "pc-data-source-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Data sources");
  panel.innerHTML = `
    <div class="pc-data-source-panel__header">
      <div>
        <h2>Data sources</h2>
        <p>Choose the available Product sources shown on the map.</p>
      </div>
    </div>
    <div class="pc-data-source-panel__content" data-data-source-list></div>
    <div class="pc-data-source-panel__footer">
      <button type="button" data-data-source-reset>Reset to defaults</button>
    </div>
  `;
  document.body.append(panel);

  const list = panel.querySelector("[data-data-source-list]");
  const resetButton = panel.querySelector("[data-data-source-reset]");
  const isOpen = () => !panel.hidden;

  function render() {
    const stateById = new Map(
      controller.getStates().map(({ source, state }) => [source.id, state])
    );
    list.replaceChildren(
      ...sources.map((source) => createSourceRow(source, stateById.get(source.id)))
    );
  }

  function setOpen(open, { restoreFocus = false } = {}) {
    const nextOpen = Boolean(open);
    panel.hidden = !nextOpen;
    button.toggleAttribute("active", nextOpen);
    button.setAttribute("aria-expanded", String(nextOpen));

    if (nextOpen) {
      render();
      positionPanel(button, panel);
      panel.querySelector("calcite-switch")?.focus?.();
    } else if (restoreFocus) {
      button.focus();
    }

    return true;
  }

  function close(options = {}) {
    if (!isOpen()) {
      return false;
    }
    return setOpen(false, options);
  }

  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", panel.id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", handleButtonClick);
  panel.addEventListener("click", handlePanelClick);
  panel.addEventListener("calciteSwitchChange", handleSwitchChange);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("resize", handleResize);
  const unsubscribe = controller.subscribe(() => render());

  function handleButtonClick(event) {
    event.stopPropagation();
    setOpen(!isOpen());
  }

  function handlePanelClick(event) {
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-data-source-reset]")) {
      void controller.resetToDefaults({
        reason: "data-source-panel-reset",
      });
    }
  }

  function handleSwitchChange(event) {
    event.stopPropagation();
    const switchElement =
      event.target instanceof Element
        ? event.target.closest("calcite-switch[data-source-id]")
        : null;
    if (!switchElement) {
      return;
    }

    void controller.setSourceEnabled(switchElement.dataset.sourceId, switchElement.checked, {
      reason: "data-source-panel",
    });
  }

  function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isOpen() || panel.contains(target) || button.contains(target)) {
      return;
    }

    close();
  }

  function handleKeydown(event) {
    if (event.key !== "Escape" || event.defaultPrevented || !isOpen()) {
      return;
    }

    close({ restoreFocus: true });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleResize() {
    if (isOpen()) {
      positionPanel(button, panel);
    }
  }

  render();
  return {
    isOpen,
    close,
    resetToDefaults: () =>
      controller.resetToDefaults({
        reason: "data-source-panel-reset",
      }),
    destroy() {
      unsubscribe();
      button.removeEventListener("click", handleButtonClick);
      panel.removeEventListener("click", handlePanelClick);
      panel.removeEventListener("calciteSwitchChange", handleSwitchChange);
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeydown, true);
      window.removeEventListener("resize", handleResize);
      panel.remove();
      button.toggleAttribute("active", false);
      button.setAttribute("aria-expanded", "false");
    },
  };
}

function createSourceRow(source, state) {
  const row = document.createElement("div");
  row.className = "pc-data-source-panel__row";
  row.dataset.sourceId = source.id;

  const copy = document.createElement("div");
  copy.className = "pc-data-source-panel__copy";

  const label = document.createElement("span");
  label.className = "pc-data-source-panel__label";
  label.textContent = source.label;
  copy.append(label);

  const status = document.createElement("span");
  status.className = "pc-data-source-panel__status";
  status.setAttribute("aria-live", "polite");
  status.textContent = createStatusText(state);
  if (state?.error) {
    status.classList.add("pc-data-source-panel__status--error");
    status.title = state.error;
  }
  copy.append(status);

  const switchElement = document.createElement("calcite-switch");
  switchElement.scale = "s";
  switchElement.checked = Boolean(state?.requestedEnabled);
  switchElement.dataset.sourceId = source.id;
  switchElement.label = `${state?.requestedEnabled ? "Disable" : "Enable"} ${source.label}`;
  switchElement.setAttribute("aria-label", switchElement.label);

  row.append(copy, switchElement);
  return row;
}

function createStatusText(state) {
  if (state?.loading) {
    return state.enabled ? "Refreshing..." : "Loading...";
  }
  if (state?.error) {
    return "Error";
  }
  return state?.enabled ? "Enabled" : "Disabled";
}

function positionPanel(button, panel) {
  const rect = button.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
}

function createEmptyApi() {
  return {
    isOpen: () => false,
    close: () => false,
    resetToDefaults: async () => ({ success: true, results: [] }),
    destroy() {},
  };
}
