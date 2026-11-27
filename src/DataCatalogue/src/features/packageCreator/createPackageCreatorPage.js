import { severityLabel } from "../../shared/domain/severity.js";
import { renderPackageDescriptions } from "../assignmentPage/ui/renderPackageDescriptions.js";
import { createBasemapSelector } from "../map/basemaps/createBasemapSelector.js";
import { packageGeometryMessage } from "../map/packages/createPackageGeometryOverlay.js";
import { createPackageRequest, manualPackageCategories } from "./createPackageRequest.js";
import { createPackageCreationSession } from "./createPackageCreationSession.js";

export function createPackageCreatorPage({
  service,
  readCategories,
  createMap,
  basemapSettings,
  onCatalogueChange,
  confirm = (message) => window.confirm(message),
}) {
  const element = document.createElement("section");
  element.className = "dc-package-creator";
  element.setAttribute("aria-label", "Package Creator");
  element.innerHTML = `
    <div class="dc-creator-details">
      <h1>Package Creator</h1>
      <form data-creator="form" novalidate>
        <fieldset data-creator="fields" aria-label="Package draft">
          <fieldset class="dc-creator-group">
            <legend>Package details</legend>
            <div class="dc-creator-pair">
              <label><span>Category <span aria-hidden="true">*</span></span>
                <select name="category" required aria-describedby="dc-creator-category-status"></select>
              </label>
              <label>Priority
                <select name="priority">
                  <option value="">Not prioritized</option>
                  <option value="highest">Highest priority</option>
                  <option value="custom">Custom severity</option>
                </select>
              </label>
            </div>
            <div id="dc-creator-category-status" data-creator="categoryStatus" role="status"></div>
            <button type="button" data-creator="reloadCategories" hidden>Reload categories</button>
            <label data-creator="severityField" hidden><span>Severity <span aria-hidden="true">*</span></span>
              <input name="severity" inputmode="numeric" spellcheck="false" aria-describedby="dc-creator-severity-help" disabled />
              <span class="dc-creator-help" id="dc-creator-severity-help">Whole number from 0 to 18446744073709551615.</span>
            </label>
            <label>Title <input name="title" /></label>
          </fieldset>
          <fieldset class="dc-creator-group">
            <legend>Source</legend>
            <label><span>Source URI <span aria-hidden="true">*</span></span>
              <input name="absoluteUri" required spellcheck="false" aria-describedby="dc-creator-source-help" />
            </label>
            <p class="dc-creator-help" id="dc-creator-source-help">Use an absolute URI. Enter the case number separately.</p>
            <div class="dc-creator-pair">
              <label>Source name <input name="source" /></label>
              <label>Source type <input name="type" /></label>
            </div>
            <label>Case / reference number <input name="refId" /></label>
          </fieldset>
          <fieldset class="dc-creator-group">
            <legend>Description</legend>
            <label>Description text <textarea name="description" rows="2"></textarea></label>
            <div class="dc-creator-pair">
              <label>Language
                <select name="descriptionLanguage">
                  <option value="">Not specified</option>
                  <option value="da">Danish (da)</option>
                  <option value="en">English (en)</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label data-creator="languageField" hidden><span>Language code <span aria-hidden="true">*</span></span>
                <input name="language" spellcheck="false" aria-describedby="dc-creator-language-help" disabled />
                <span class="dc-creator-help" id="dc-creator-language-help">For example, de.</span>
              </label>
            </div>
          </fieldset>
        </fieldset>
        <fieldset class="dc-creator-group">
          <legend>AOI <span aria-hidden="true" data-creator="aoiRequired">*</span></legend>
          <p class="dc-creator-help" data-creator="aoiHelp">Draw rectangles, polygons or circles. Select an area to edit or delete it. Press Escape to cancel.</p>
          <p data-creator="mapStatus" role="status" tabindex="-1"></p>
          <button type="button" data-creator="retryPreview" hidden>Retry stored geometry</button>
        </fieldset>
        <div class="dc-creator-actions" data-creator="draftActions">
          <button type="submit" data-creator="submit">Create Package</button>
          <button type="button" data-creator="reset">Reset draft</button>
        </div>
      </form>
      <p data-creator="status" role="status" tabindex="-1"></p>
      <div class="dc-creator-actions">
        <button type="button" data-creator="reconcile" hidden>Check Package by ID</button>
        <button type="button" data-creator="abandon" hidden>Abandon reconciliation</button>
      </div>
      <section data-creator="result" aria-label="Created Package" hidden>
        <dl data-creator="resultFields"></dl>
        <div data-creator="description"></div>
        <button type="button" data-creator="another">Start another Package</button>
      </section>
    </div>
    <section class="dc-creator-map" aria-label="Package AOI map">
      <div class="dc-creator-map-view" data-creator="map"></div>
      <div data-creator="basemap"></div>
      <div class="dc-creator-map-tools" role="group" aria-label="AOI tools">
        <div data-creator="sketch"></div>
        <div class="dc-creator-map-actions">
          <button type="button" data-creator="clear" title="Clear all draft areas">Clear AOI</button>
          <button type="button" data-creator="fit" title="Fit AOI to map">Fit AOI</button>
        </div>
      </div>
    </section>
  `;
  const get = (name) => element.querySelector(`[data-creator="${name}"]`);
  const form = get("form");
  const categorySelect = form.elements.namedItem("category");
  const priority = form.elements.namedItem("priority");
  const severity = form.elements.namedItem("severity");
  const languageChoice = form.elements.namedItem("descriptionLanguage");
  const language = form.elements.namedItem("language");
  const status = get("status");
  const lifetime = new AbortController();
  const listen = (node, name, callback) =>
    node.addEventListener(name, callback, { signal: lifetime.signal });
  const basemap = createBasemapSelector({ container: get("basemap"), settings: basemapSettings });

  let map;
  let active = false;
  let categories = null;
  let categoryRead = null;
  let aoi = null;
  let dirty = false;
  let drawing = false;
  let ready = false;
  let previewReady = false;
  let unloadGuard = false;

  const session = createPackageCreationSession({
    service,
    onCatalogueChange,
    onState: renderSubmission,
  });

  function blockUnload(event) {
    event.preventDefault();
    event.returnValue = "";
  }

  function syncOptionalFields() {
    const customSeverity = priority.value === "custom";
    const customLanguage = languageChoice.value === "other";
    get("severityField").hidden = !customSeverity;
    severity.disabled = !customSeverity;
    severity.required = customSeverity;
    get("languageField").hidden = !customLanguage;
    language.disabled = !customLanguage;
    language.required = customLanguage;
  }

  function syncControls() {
    const { status: phase, checking } = session.snapshot();
    const editable = phase === "draft" || phase === "rejected";
    const protect = (active && (dirty || drawing)) || phase === "pending" || phase === "unknown";
    if (protect !== unloadGuard) {
      if (protect) window.addEventListener("beforeunload", blockUnload);
      else window.removeEventListener("beforeunload", blockUnload);
      unloadGuard = protect;
    }
    get("fields").disabled = !editable;
    get("submit").disabled = !editable || !categories?.length || !ready || !aoi || drawing;
    get("reset").disabled = !editable || !(dirty || drawing);
    map?.setEditing(active && ready && editable);
    categorySelect.disabled = !categories?.length;
    get("clear").disabled = !editable || !aoi || drawing;
    get("fit").disabled = drawing || !ready || (!aoi && !previewReady);
    get("reloadCategories").disabled = !editable || Boolean(categoryRead);
    get("reconcile").disabled = Boolean(checking);
    get("abandon").disabled = Boolean(checking);
  }

  async function loadCategories() {
    if (categoryRead) return;
    const controller = new AbortController();
    categoryRead = controller;
    get("categoryStatus").textContent = "Loading categories…";
    get("reloadCategories").hidden = true;
    syncControls();
    try {
      const loaded = await readCategories({
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      if (controller.signal.aborted) return;
      categories = manualPackageCategories(loaded);
      const selected = categorySelect.value;
      categorySelect.replaceChildren(
        new Option("Select category", ""),
        ...categories.map(({ id, name }) => new Option(name, id))
      );
      categorySelect.value = categories.some(({ id }) => id === selected) ? selected : "";
      if (categories.length) get("categoryStatus").textContent = "";
      else get("categoryStatus").textContent = "No categories are available for manual creation.";
    } catch (error) {
      if (!controller.signal.aborted) {
        get("categoryStatus").textContent = `Categories unavailable: ${error.message}`;
      }
    } finally {
      if (!controller.signal.aborted) {
        categoryRead = null;
        get("reloadCategories").hidden = Boolean(categories?.length);
        syncControls();
      }
    }
  }

  function renderResult(item, submittedUri) {
    const category = categories?.find(({ id }) => id === item.category)?.name ?? item.category;
    const fields = [
      ["Short ID", item.shortId],
      ["Package ID", item.id],
      ["Category", category],
      ["Submitted Source URI", submittedUri],
      ["Source readback", item.sourceReadback],
      ["Title", item.title],
      ["Source type", item.type],
      ["Source name", item.publication],
      ["Case / reference number", item.references],
      ["Severity", severityLabel(item.severity)],
      ["Workstreams", item.pipelineIds.join(", ") || "None"],
    ];
    const rows = get("resultFields");
    rows.replaceChildren();
    for (const [label, value] of fields) {
      if (value == null || value === "") continue;
      const term = document.createElement("dt");
      term.textContent = label;
      const definition = document.createElement("dd");
      definition.textContent = value;
      rows.append(term, definition);
    }
    renderPackageDescriptions(get("description"), item.descriptionEntries, "");
    get("description").hidden = !item.descriptionEntries.length;
  }

  function renderSubmission(state) {
    const { status: phase, item, knownId, message, checking } = state;
    const confirmed = phase === "confirmed";
    const unknown = phase === "unknown";
    get("fields").hidden = confirmed;
    get("draftActions").hidden = confirmed;
    get("aoiHelp").hidden = confirmed || unknown || phase === "pending";
    get("aoiRequired").hidden = confirmed;
    if (confirmed) map?.setEditing(false);
    get("result").hidden = !confirmed;
    get("reconcile").hidden = !unknown || !knownId;
    get("abandon").hidden = !unknown;
    if (phase === "pending") status.textContent = "Creating Package…";
    else if (phase === "rejected") status.textContent = `Package creation rejected. ${message}`;
    else if (unknown) {
      status.textContent = [
        "Creation outcome unknown.",
        knownId ? `Package ID: ${knownId}.` : "No trusted Package ID is available.",
        checking ? "Checking the Package by ID…" : message,
        "Keep the submitted details for operator review before attempting another creation.",
      ]
        .filter(Boolean)
        .join(" ");
    } else if (confirmed) {
      status.textContent = `Package ${item.shortId} created.`;
      renderResult(item, state.submittedUri);
      map?.clear();
      dirty = false;
      void map?.showPackage(item.id);
    } else status.textContent = "";
    syncControls();
    if (active && (confirmed || unknown || phase === "rejected")) status.focus();
  }

  function makeMap() {
    get("mapStatus").textContent = "Loading map…";
    try {
      map = createMap({
        container: get("map"),
        sketchHost: get("sketch"),
        onReady(value, message) {
          ready = value;
          if (!value || session.snapshot().status !== "confirmed") {
            get("mapStatus").textContent = message ?? "";
          }
          syncControls();
        },
        onSketchState(state) {
          if (state.aoi !== aoi) {
            dirty = Boolean(state.aoi) || [...new FormData(form).values()].some(Boolean);
          }
          ({ aoi, drawing } = state);
          if (session.snapshot().status !== "confirmed") {
            get("mapStatus").textContent =
              state.message ??
              (drawing
                ? "AOI edit in progress."
                : aoi
                  ? `${state.count} draft ${state.count === 1 ? "area" : "areas"} ready.`
                  : "");
          }
          syncControls();
        },
        onPreviewState(state) {
          previewReady = state.hasAoi && state.status === "ready";
          get("retryPreview").hidden =
            state.status === "loading" || previewReady || !session.snapshot().item;
          if (session.snapshot().status === "confirmed") {
            get("mapStatus").textContent =
              state.status === "ready" && !state.hasAoi
                ? "The stored response did not include a displayable AOI."
                : packageGeometryMessage(state);
          }
          syncControls();
        },
      });
      basemap?.setView(map.view);
    } catch (error) {
      get("mapStatus").textContent = `Map unavailable: ${error.message}`;
    }
  }

  function reset({ abandon = false, focus = true } = {}) {
    if (!session.reset({ abandon })) return;
    form.reset();
    syncOptionalFields();
    categorySelect.value = "";
    dirty = false;
    map?.clear();
    void map?.showPackage(null);
    syncControls();
    if (focus) categorySelect.focus();
  }

  listen(form, "input", () => {
    syncOptionalFields();
    dirty = [...new FormData(form).values()].some(Boolean) || Boolean(aoi);
    syncControls();
  });
  listen(form, "submit", (event) => {
    event.preventDefault();
    if (get("submit").disabled) return;
    try {
      const request = createPackageRequest(Object.fromEntries(new FormData(form)), categories, aoi);
      void session.submit(request);
    } catch (error) {
      status.textContent = error.message;
      status.focus();
    }
  });
  listen(get("reloadCategories"), "click", () => void loadCategories());
  listen(get("clear"), "click", () => {
    if (get("clear").disabled) return;
    map.clear();
    dirty = [...new FormData(form).values()].some(Boolean);
    syncControls();
    get("mapStatus").textContent = "Draft AOI cleared.";
    get("mapStatus").focus();
  });
  listen(get("fit"), "click", () => void map.focus());
  listen(get("retryPreview"), "click", () => {
    void map.showPackage(session.snapshot().item.id, { reload: true });
  });
  listen(get("reset"), "click", () => {
    if (confirm("Discard this Package draft?")) reset();
  });
  listen(get("another"), "click", () => reset());
  listen(get("reconcile"), "click", () => void session.reconcile());
  listen(get("abandon"), "click", () => {
    if (
      confirm(
        "The Package may have been created. Abandon this reconciliation and discard the submitted draft?"
      )
    ) {
      reset({ abandon: true });
    }
  });

  syncOptionalFields();
  syncControls();
  return {
    element,
    activate() {
      active = true;
      if (!map) makeMap();
      syncControls();
      if (!categories) void loadCategories();
    },
    deactivate() {
      active = false;
      categoryRead?.abort();
      categoryRead = null;
      if (dirty || drawing) reset({ focus: false });
      syncControls();
    },
    allowLeave() {
      const { status: phase } = session.snapshot();
      if (phase === "pending" || phase === "unknown") {
        status.focus();
        return false;
      }
      return (
        !(dirty || drawing) || confirm("Discard this Package draft and leave Package Creator?")
      );
    },
    destroy() {
      lifetime.abort();
      window.removeEventListener("beforeunload", blockUnload);
      categoryRead?.abort();
      session.destroy();
      basemap?.destroy();
      map?.destroy();
      element.remove();
    },
  };
}
