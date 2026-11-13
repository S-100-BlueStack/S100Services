import { formatLastRefreshedTime } from "./formatLastRefreshedTime.js";
import { createBasemapSelector } from "../../map/basemaps/createBasemapSelector.js";
import { renderInformationFields } from "./renderInformationFields.js";
import { createPipelineRow } from "./createPipelineRow.js";
import { matchesLoadedPackage } from "../state/matchesLoadedPackage.js";
import { severityLabel } from "../../../shared/domain/severity.js";
import { createQueryLifecycle } from "../state/createQueryLifecycle.js";
import {
  WORK_STREAM_LIST_MODE,
  normalizeWorkStreamListMode,
  toggleWorkStreamListMode,
  workStreamIdsForMode,
  workStreamModeButtonLabel,
} from "../state/workStreamListMode.js";
import { createAssignmentSession } from "../../assignments/state/createAssignmentSession.js";
import { assignmentStatus } from "../../assignments/domain/assignmentDraft.js";
import { matchesFeature } from "../../features/domain/featureQuery.js";
import { createDraftNavigation } from "./confirmDraftNavigation.js";
import { createRequiredTargetGetter } from "./assignmentPageContract.js";
import { createWorkStreamRow } from "./createWorkStreamRow.js";

export function createAssignmentPage({
  services,
  createMap,
  runtimeConfig,
  onPackageSelected,
  basemapSettings,
}) {
  const live = services.source === "live";
  const entityName = live ? "Package" : "Feature";
  const assignmentName = live ? "Pipeline" : "Work stream";
  const element = document.createElement("main");
  element.className = "dc-assignment-page";
  element.id = "data-catalogue-feature-assignment";
  element.setAttribute(
    "aria-label",
    live ? "Package Pipeline assignment" : "Feature assignment prototype"
  );
  const markup = `
    <div class="dc-assignment-column dc-assignment-column--left">
      <section class="dc-assignment-panel dc-feature-panel" aria-label="Feature assignment">
        <form class="dc-assignment-toolbar" data-filter-form>
          <label>Type<select data-type><option value="">All types</option><option>NM</option><option>KP</option></select></label>
          <label>Status<select data-status><option value="">All statuses</option><option>Assigned</option><option>Not assigned</option></select></label>
          <label class="dc-assignment-grow">Feature name<input type="search" data-search placeholder="Search NM / KP" autocomplete="off"></label>
        </form>
        <p data-category-status role="status"></p>
        <p data-list-status role="status"></p>
        <div class="dc-assignment-scroll" data-features></div>
        <footer class="dc-assignment-toolbar"><button type="button" data-feature-prev>Previous</button><span data-feature-page></span><button type="button" data-feature-next>Next</button><span class="dc-feature-list-refresh-group"><button class="dc-assignment-icon-action dc-feature-list-refresh" type="button" data-feature-retry aria-label="Refresh Packages" title="Refresh Packages"><calcite-icon icon="refresh" scale="s" aria-hidden="true"></calcite-icon></button><time class="dc-feature-list-last-refreshed" data-feature-last-refreshed></time></span></footer>
      </section>
      <section class="dc-assignment-panel dc-work-stream-panel" data-work-stream-panel aria-label="Work stream assignments">
        <div class="dc-assignment-toolbar dc-assignment-panel-toolbar">
          <span class="dc-assignment-muted" data-active-count></span>
          <button type="button" data-work-stream-mode aria-pressed="false">Show active</button>
          <button type="button" data-reconcile hidden>Check saved bindings</button>
          <button type="button" data-abandon hidden>Discard local draft</button>
          <span class="dc-assignment-toolbar-spacer"></span>
          <span data-draft-status role="status"></span>
          <button class="dc-assignment-icon-action dc-binding-save" type="button" data-save disabled aria-label="Save bindings" title="Save bindings"><calcite-icon icon="save" scale="m" aria-hidden="true"></calcite-icon></button>
        </div>
        <p data-save-error role="alert"></p>
        <p data-work-stream-status role="status">Select a Feature to edit assignments.</p>
        <div class="dc-assignment-scroll" data-work-streams></div>
        <div class="dc-assignment-toolbar dc-work-stream-reload">
          <button type="button" data-work-stream-retry hidden>Retry pipelines</button>
        </div>
      </section>
    </div>
    <div class="dc-assignment-column dc-assignment-column--right">
      <section class="dc-assignment-panel dc-information-panel" aria-label="Feature information">
        <h2 class="dc-information-panel__name" data-package-name></h2>
        <div class="dc-information-panel__bindings" data-saved-bindings></div>
        <p data-selection-status role="status">Select a Feature to view its information.</p>
        <button type="button" data-selection-retry hidden>Retry Feature</button>
        <div class="dc-assignment-scroll" data-information></div>
      </section>
      <section class="dc-assignment-panel dc-assignment-map-panel" aria-label="Assignment map">
        <p data-map-empty>Select a Feature to focus its geometry.</p>
        <div class="dc-assignment-map-stage">
          <div class="dc-assignment-map" data-map></div>
          <div class="dc-basemap-control dc-basemap-control--assignment" data-basemap-host></div>
          <button class="dc-assignment-map-retry" type="button" data-map-retry aria-label="Retry map" title="Retry map">
            <calcite-icon icon="refresh" scale="s" aria-hidden="true"></calcite-icon>
          </button>
        </div>
        <p data-map-status role="status"></p>
        <div class="dc-assignment-legend" aria-label="Assignment map legend">
          <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__feature" aria-hidden="true"></span>Selected Feature</span>
          <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-assigned" aria-hidden="true"></span>Assigned Work stream</span>
          <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-context" aria-hidden="true"></span>Unassigned context</span>
        </div>
      </section>
    </div>
    <footer class="dc-prototype-toolbar dc-assignment-toolbar"><span>Mock data · Prototype user · Saved comments are immutable</span><button type="button" data-fail-load>Fail next load</button><button type="button" data-fail-save>Fail next save</button><button type="button" data-reset>Reset mock data</button><span data-test-status role="status"></span></footer>`;

  element.innerHTML = live
    ? markup.replaceAll("Feature", "Package").replaceAll("Work stream", "Pipeline")
    : markup;
  if (live) element.className += " dc-assignment-page--live";

  const get = createRequiredTargetGetter((name) => element.querySelector(`[data-${name}]`));
  get("feature-last-refreshed").textContent = "Last refreshed: —";
  get("feature-last-refreshed").hidden = !live;
  if (live) {
    get("search").placeholder = "Search this page";
    get("search").setAttribute("aria-label", "Search Packages on this page");
    get("search").previousSibling.textContent = "";
    get("type").previousSibling.textContent = "";
    get("type").setAttribute("aria-label", "Package category");
    get("status").previousSibling.textContent = "";
    get("status").setAttribute("aria-label", "Package assignment status");
    get("type").replaceChildren(new Option("All categories", ""));
    get("map-empty").textContent = "Select a Package to view geography.";
    get("work-stream-mode").hidden = true;
    element.querySelector(".dc-assignment-legend").innerHTML = `
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-package-aoi" aria-hidden="true"></span>Package AOI</span>
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-package-detail" aria-hidden="true"></span>Detailed Features</span>
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-context" aria-hidden="true"></span>Saved Workspaces</span>
    `;
    for (const name of ["fail-load", "fail-save", "reset"]) get(name).hidden = true;
  }
  const basemapSelector = basemapSettings
    ? createBasemapSelector({ container: get("basemap-host"), settings: basemapSettings })
    : null;
  const abort = new AbortController();
  const listen = (node, name, handler) =>
    node.addEventListener(name, handler, { signal: abort.signal });
  const session = createAssignmentSession({ services });
  const mapRetryControl = get("map-retry");
  let alive = true;
  const categoryRequests = createQueryLifecycle();
  const featureRequests = createQueryLifecycle();
  let featureRequestController = null;
  const packageSummaries = new Map();
  const workStreamRequests = createQueryLifecycle();
  let featurePage = 0;
  let workStreamMode = WORK_STREAM_LIST_MODE.ALL;
  let currentQuery = {};
  let displayedId = null;
  let requestedId = null;
  let rows = [];
  let loadedPage = null;
  const pipelineNames = new Map();
  let pipelineNamesRequest = null;
  let rowsFeatureId = null;
  let workStreamsRequestPending = false;
  const featureRows = new Map();
  const workStreamRows = new Map();
  let map = null;
  let mapGeneration = 0;
  let lastAssignmentKey = "";
  let lastScopeKey = "";
  let searchTimer;
  let resetting = false;
  const guard = createDraftNavigation({
    session,
    host: element,
    entityName,
    onSaved: () => {
      if (!live) void loadFeatures();
    },
    onSaveAttempt: () => {
      if (live) void loadFeatures();
    },
  });

  function busy() {
    return resetting || session.snapshot().saving;
  }

  function makeMap() {
    map?.view?.ui?.remove?.(mapRetryControl);
    get("map").parentElement?.append(mapRetryControl);
    basemapSelector?.setView(null);
    map?.destroy();
    map = null;
    const current = ++mapGeneration;
    lastAssignmentKey = "";

    try {
      map = createMap({
        container: get("map"),
        runtimeConfig,
        basemapSettings,
        workStreams: services.workStreams,
        onStatus(message) {
          if (alive && current === mapGeneration) get("map-status").textContent = message;
        },
      });
      basemapSelector?.setView(map.view ?? null);
      map.view?.ui?.add?.(mapRetryControl, { position: "top-right", index: 2 });
      syncMap(session.snapshot());
    } catch {
      get("map-status").textContent = "Map initialization failed. Retry map when ready.";
    }
  }

  function syncMap(state) {
    if (live) {
      map?.selectContext(state.feature, state.record);
      return;
    }
    void map?.selectFeature(state.feature);
    const ids = state.draft?.activeIds ?? [];
    const key = JSON.stringify(ids);
    if (key !== lastAssignmentKey) {
      lastAssignmentKey = key;
      map?.setAssigned(ids);
    }
  }

  function filterQuery() {
    return {
      type: get("type").value,
      status: get("status").value,
      search: live ? "" : get("search").value,
      page: featurePage,
      pageSize: 25,
    };
  }

  function ensurePipelineNames() {
    if (!live || pipelineNamesRequest || !services.workStreams?.list) return pipelineNamesRequest;
    // Only assigned pages need names; do not introduce an extra catalogue read for
    // unassigned or legacy list pages. Never issue per-Package binding reads.
    pipelineNamesRequest = services.workStreams
      .list({ ids: null, signal: abort.signal })
      .then((result) => {
        if (!alive || abort.signal.aborted) return;
        for (const item of result.items) pipelineNames.set(String(item.id), item.name);
        for (const row of featureRows.values()) updateFeatureRowSummary(row);
      })
      .catch(() => {
        // The row still has an authoritative Pipeline ID if name lookup fails.
        pipelineNamesRequest = null;
      });
    return pipelineNamesRequest;
  }

  async function loadFeatures() {
    clearTimeout(searchTimer);
    featureRequestController?.abort();
    const controller = new AbortController();
    featureRequestController = controller;
    const isCurrent = featureRequests.begin();
    const query = { ...filterQuery(), signal: controller.signal };
    currentQuery = query;
    get("list-status").textContent = `Loading ${entityName}s…`;
    get("feature-prev").disabled = true;
    get("feature-next").disabled = true;
    get("features").setAttribute("aria-busy", "true");

    try {
      const result = await services.features.search(query);
      if (!isCurrent()) return;
      featurePage = result.page;
      loadedPage = result;
      // Fresh page summaries supersede previously inspected rows. Keep uncertain
      // selections unavailable until their explicit read-only reconciliation.
      if (live) {
        const selected = session.snapshot();
        for (const item of result.items) {
          if (
            item.status != null &&
            (item.id !== selected.feature?.id || !selected.reconciliationRequired)
          ) {
            packageSummaries.delete(item.id);
          }
        }
      }
      // List pagination must never fan out into one bindings request per Package.
      // Previously inspected Package summaries remain available across pages.
      renderFeatureRows(result);
      if (live && result.items.some((item) => item.pipelineIds?.length)) {
        void ensurePipelineNames();
      }
      if (live) {
        // A response is only considered refreshed after its accepted page renders.
        const refreshed = new Date();
        const display = get("feature-last-refreshed");
        display.dateTime = refreshed.toISOString();
        const localTime = formatLastRefreshedTime(refreshed);
        display.textContent = `Last refreshed: ${localTime}`;
        display.title = `Package list fetched at ${localTime} local time. This is not the server's modification time.`;
      }
    } catch (error) {
      if (isCurrent()) {
        loadedPage = null;
        get("list-status").textContent = error.message;
        get("features").replaceChildren();
      }
    } finally {
      if (isCurrent()) get("features").setAttribute("aria-busy", "false");
    }
  }

  function rememberSavedBindings(state) {
    if (!live || !state.feature?.id || state.loading || state.saving || state.selectionError)
      return;
    if (state.reconciliationRequired) {
      // A timed-out write may have committed; previously read bindings are not authoritative.
      packageSummaries.set(state.feature.id, { status: null, pipelineIds: null });
      return;
    }
    if (!state.record?.relations) return;
    const pipelineIds = Object.entries(state.record.relations)
      .filter(([, binding]) => binding?.active)
      .map(([pipelineId]) => pipelineId);
    packageSummaries.set(state.feature.id, {
      status: pipelineIds.length ? "Assigned" : "Not assigned",
      pipelineIds,
    });
  }

  function updateFeatureRowSummary(button) {
    const feature = loadedPage?.items.find((item) => item.id === button.dataset.featureId);
    const summary = packageSummaries.get(button.dataset.featureId) ?? feature;
    const status = summary?.status ?? (live ? "Unknown" : "");
    const badge = button.children[0]?.children[1];
    if (badge) {
      badge.textContent = status;
      badge.hidden = !status;
      badge.className = `dc-assignment-status ${status === "Assigned" ? "is-assigned" : status === "Not assigned" ? "is-unassigned" : ""}`;
    }
    if (!live) return;
    const pipelineSummary = button.children[0]?.children[0]?.children[1];
    if (!pipelineSummary) return;
    const pipelineIds = Array.isArray(summary?.pipelineIds) ? summary.pipelineIds : [];
    const savedPipelines = pipelineIds.map((id) => pipelineNames.get(id) ?? id);
    pipelineSummary.textContent = savedPipelines.join(", ");
    pipelineSummary.title = pipelineSummary.textContent;
    pipelineSummary.hidden = !savedPipelines.length;
  }

  function renderFeatureRows(result) {
    const query = live ? get("search").value : "";
    const matches = live
      ? result.items.filter((item) => matchesLoadedPackage(item, query))
      : result.items;
    const nextRows = [];

    for (const feature of matches) {
      let button = featureRows.get(feature.id);
      if (!button) {
        button = document.createElement("button");
        featureRows.set(feature.id, button);
      }
      button.type = "button";
      button.className = "dc-feature-row";
      button.dataset.featureId = feature.id;
      const top = document.createElement("span");
      top.className = "dc-feature-row__primary";
      const name = document.createElement("span");
      name.textContent = feature.name;
      const status = document.createElement("span");
      status.className = "dc-assignment-status";
      if (live) {
        const identity = document.createElement("span");
        identity.className = "dc-feature-row__identity";
        const pipelines = document.createElement("span");
        pipelines.className = "dc-feature-row__pipelines";
        identity.append(name, pipelines);
        top.append(identity, status);
      } else {
        top.append(name, status);
      }
      button.replaceChildren(top);
      updateFeatureRowSummary(button);
      nextRows.push(button);
    }

    reconcileRows(get("features"), nextRows, get("search"));
    const visibleIds = new Set(matches.map((item) => item.id));
    for (const id of featureRows.keys()) {
      if (!visibleIds.has(id)) featureRows.delete(id);
    }

    get("list-status").textContent =
      live && query.trim()
        ? `${matches.length} matching on this page${matches.length ? "" : " — try another page"}`
        : `${result.total} ${entityName}s${result.total ? "" : " — no matches"}`;
    get("feature-page").textContent = result.total
      ? `Page ${result.page + 1} of ${Math.ceil(result.total / result.pageSize)}`
      : "No results";
    get("feature-prev").disabled = !result.page;
    get("feature-next").disabled = (result.page + 1) * result.pageSize >= result.total;
    syncSelection(session.snapshot());
  }

  function workStreamIds(state) {
    return workStreamIdsForMode(state.draft, workStreamMode);
  }

  function syncWorkStreamMode(state) {
    if (state.draft) {
      const nextMode = normalizeWorkStreamListMode(workStreamMode, state.draft.activeIds.length);
      if (nextMode !== workStreamMode) {
        workStreamMode = nextMode;
        workStreamRequests.invalidate();
        lastScopeKey = "";
      }
    }

    get("work-stream-mode").textContent = workStreamModeButtonLabel(workStreamMode);
    get("work-stream-mode").setAttribute(
      "aria-pressed",
      String(workStreamMode === WORK_STREAM_LIST_MODE.ACTIVE)
    );
  }

  function setWorkStreamsBusy(value) {
    // The retained rows belong to the previous fully loaded context until replacement finishes.
    get("work-streams").inert = value;
    get("work-streams").setAttribute("aria-busy", String(value));
  }

  async function loadWorkStreams() {
    const isCurrent = workStreamRequests.begin();
    const state = session.snapshot();
    if (!state.feature) return;

    const scopedIds = workStreamIds(state);
    lastScopeKey = JSON.stringify([state.feature.id, workStreamMode, scopedIds]);
    get("work-stream-status").textContent = `Loading ${assignmentName}s…`;
    get("work-stream-retry").hidden = true;
    workStreamsRequestPending = true;
    setWorkStreamsBusy(true);

    try {
      const result = await services.workStreams.list({ ids: scopedIds });
      if (!isCurrent() || state.feature.id !== session.snapshot().feature?.id) return;

      for (const workStream of result.items) {
        pipelineNames.set(String(workStream.id), workStream.name);
      }
      rows = result.items.map((workStream) => {
        if (!workStreamRows.has(workStream.id)) {
          workStreamRows.set(
            workStream.id,
            live
              ? createPipelineRow(workStream, session, {
                  listWorkspaces: services.workspaces?.list,
                })
              : createWorkStreamRow(workStream, session)
          );
        }
        return workStreamRows.get(workStream.id);
      });

      const latest = session.snapshot();
      for (const row of rows) row.update(latest);
      rowsFeatureId = state.feature.id;
      reconcileRows(
        get("work-streams"),
        rows.map((row) => row.element),
        get("work-stream-mode")
      );

      const visibleIds = new Set(result.items.map((item) => item.id));
      for (const [id, row] of workStreamRows) {
        if (!visibleIds.has(id)) {
          row.destroy?.();
          workStreamRows.delete(id);
        }
      }

      get("work-stream-status").textContent = result.total
        ? live
          ? ""
          : `${result.total} Work streams. Any Work stream may be assigned.`
        : workStreamMode === WORK_STREAM_LIST_MODE.ACTIVE
          ? `No active ${assignmentName} assignments.`
          : `No ${assignmentName}s are available.`;
      get("work-stream-retry").hidden = true;
      if (live) {
        const current = session.snapshot();
        renderSavedBindings(current);
        // Resolved Pipeline names also update previously visited Package rows.
        for (const row of featureRows.values()) updateFeatureRowSummary(row);
      }
    } catch (error) {
      if (isCurrent()) {
        get("work-stream-status").textContent = error.message;
        get("work-stream-retry").hidden = false;
        // Old rows must not be mistaken for bindings of a newly selected Package.
        if (rowsFeatureId !== state.feature.id) {
          rows = [];
          for (const row of workStreamRows.values()) row.destroy?.();
          workStreamRows.clear();
          get("work-streams").replaceChildren();
          rowsFeatureId = null;
        }
      }
    } finally {
      if (isCurrent()) {
        workStreamsRequestPending = false;
        setWorkStreamsBusy(false);
      }
    }
  }

  function syncSelection(state) {
    for (const button of get("features").querySelectorAll("[data-feature-id]")) {
      button.setAttribute("aria-pressed", String(button.dataset.featureId === state.feature?.id));
    }

    if (state.loading || state.selectionError) return;
    if (state.feature) {
      const matches =
        matchesFeature(
          { ...state.feature, status: assignmentStatus(state.record) },
          currentQuery
        ) &&
        (!live || matchesLoadedPackage(state.feature, get("search").value));
      get("selection-status").textContent = live
        ? matches
          ? ""
          : "Outside the current filter; selection retained."
        : `${state.feature.name} · ${assignmentStatus(state.record)}${matches ? "" : " · Outside the current filter; your editing context remains open."}`;
    }
  }

  function renderSavedBindings(state) {
    if (!live) return;
    get("package-name").textContent = state.feature?.name ?? "";
    const container = get("saved-bindings");
    container.replaceChildren();
    if (!state.feature) return;

    for (const [pipelineId, binding] of Object.entries(state.record?.relations ?? {})) {
      if (!binding?.active) continue;
      const line = document.createElement("div");
      line.className = "dc-information-panel__binding";
      const name = document.createElement("strong");
      name.textContent = pipelineNames.get(pipelineId) ?? pipelineId;
      const workspaces = Array.isArray(binding.workspaces) ? binding.workspaces : [];
      const workspaceNames = workspaces.map((item) => item.name).filter(Boolean);
      line.append(name);
      if (workspaceNames.length) {
        const details = document.createElement("span");
        details.textContent = ` · ${workspaceNames.join(", ")}`;
        line.append(details);
      }
      container.append(line);
    }
  }

  function renderInformation(feature) {
    if (!feature) {
      get("information").replaceChildren();
      return;
    }

    const fields = live
      ? [
          ["Title", feature.title],
          ["Category", feature.category],
          ["Severity", severityLabel(feature.severity)],
          ["Details", feature.details],
          ["Nautical charts", feature.nauticalCharts],
          ["Publication", feature.publication],
        ]
      : [
          ["ID", feature.sourceId],
          ["Title", feature.title],
          ["References", feature.references],
          ["Details", feature.details],
          ["Nautical charts", feature.nauticalCharts],
          ["Publication", feature.publication],
        ];
    renderInformationFields(get("information"), fields, {
      live,
      descriptionEntries: feature.descriptionEntries,
    });
  }

  const unsubscribe = session.subscribe((state) => {
    get("save").disabled =
      !state.dirty ||
      state.loading ||
      state.saving ||
      state.reconciliationRequired ||
      resetting ||
      Boolean(state.validationError);
    get("save").classList.toggle("is-actionable", !get("save").disabled);
    get("reconcile").hidden = !state.reconciliationRequired;
    get("reconcile").disabled = state.saving || state.loading || resetting;
    get("abandon").hidden = !state.reconciliationRequired;
    get("abandon").disabled = state.saving || state.loading || resetting;
    get("reconcile").textContent =
      state.saving && state.reconciliationRequired ? "Checking…" : "Check saved bindings";
    get("save").title = state.saving ? "Saving bindings" : "Save bindings";
    get("save").setAttribute("aria-label", get("save").title);
    get("draft-status").textContent = state.feature
      ? state.reconciliationRequired
        ? "Verify saved bindings"
        : state.validationError
          ? "Draft needs attention"
          : state.dirty
            ? "Unsaved changes"
            : live
              ? ""
              : "Saved state"
      : "";
    get("save-error").textContent =
      state.feature && !state.selectionError
        ? state.error || state.validationError || (live ? "" : state.record?.saveMessage) || ""
        : "";
    get("selection-status").textContent = state.loading
      ? `Loading ${entityName}…`
      : state.selectionError || state.error || `Select a ${entityName} to view its information.`;
    get("selection-retry").hidden = !state.selectionError || !requestedId;
    get("work-stream-panel").setAttribute(
      "aria-label",
      state.feature && !state.loading
        ? `${assignmentName} assignments for ${state.feature.name}`
        : `${assignmentName} assignments`
    );
    get("active-count").textContent =
      state.draft && !live
        ? `${state.draft.activeIds.length} active · ${state.draft.comments.length} draft comments`
        : "";
    get("map-empty").hidden = state.loading || Boolean(state.feature);
    get("information").setAttribute("aria-busy", String(state.loading));
    get("work-stream-mode").disabled = !state.feature || state.loading || resetting;
    get("work-stream-retry").disabled = !state.feature || state.loading || resetting;
    get("reset").disabled = state.loading || state.saving || resetting;

    syncWorkStreamMode(state);
    syncSelection(state);
    if (!state.loading) {
      rememberSavedBindings(state);
      renderSavedBindings(state);
      const selectedRow = featureRows.get(state.feature?.id);
      if (selectedRow) {
        updateFeatureRowSummary(selectedRow);
      }
    }
    // A pending selection still refers to the previous committed Package, not an empty one.
    if (!state.loading && !state.selectionError) syncMap(state);

    const id = state.feature?.id ?? null;
    if (state.loading) {
      // The session retains the previous committed Package during a selection request,
      // but its details and bindings must not look like the pending Package's data.
      const focused = document.activeElement;
      if (get("information").contains(focused) || get("work-streams").contains(focused)) {
        get("search").focus({ preventScroll: true });
      }
      get("package-name").textContent = "";
      get("saved-bindings").replaceChildren();
      get("information").replaceChildren();
      get("work-streams").replaceChildren();
      get("work-stream-status").textContent = `Loading ${assignmentName}s…`;
      get("work-stream-retry").hidden = true;
      if (workStreamsRequestPending) lastScopeKey = "";
      workStreamRequests.invalidate();
      workStreamsRequestPending = false;
      setWorkStreamsBusy(true);
    } else if (state.selectionError && state.feature) {
      // A failed selection leaves the previous committed context intact and retryable.
      renderInformation(state.feature);
      if (rowsFeatureId === state.feature.id) {
        reconcileRows(
          get("work-streams"),
          rows.map((row) => row.element),
          get("work-stream-mode")
        );
        get("work-stream-status").textContent = "";
      }
      setWorkStreamsBusy(false);
    }
    const selectionChanged = displayedId !== id;
    if (selectionChanged) {
      displayedId = id;
      workStreamRequests.invalidate();
      lastScopeKey = "";
      renderInformation(state.feature);
      if (!state.feature) {
        rows = [];
        rowsFeatureId = null;
        for (const row of workStreamRows.values()) row.destroy?.();
        workStreamRows.clear();
        get("work-streams").replaceChildren();
        get("work-stream-status").textContent = `Select a ${entityName} to edit assignments.`;
        get("work-stream-retry").hidden = true;
        setWorkStreamsBusy(false);
      } else {
        // Retain previous rows until the new Pipeline catalogue has loaded; never flash
        // the unselected Package placeholder between two valid selections.
        get("work-stream-status").textContent = `Loading ${assignmentName}s…`;
      }
    }

    if (state.feature && !state.loading) {
      // Rows belonging to another Package remain inert until their replacement is ready.
      if (rowsFeatureId === id) for (const row of rows) row.update(state);
      const scope = JSON.stringify([state.feature.id, workStreamMode, workStreamIds(state)]);
      if (scope !== lastScopeKey) {
        lastScopeKey = scope;
        void loadWorkStreams();
      } else if (state.selectionError) {
        setWorkStreamsBusy(false);
      }
    }
  });

  async function selectFeature(id, { notify = true } = {}) {
    const current = session.snapshot();
    if (id === current.feature?.id && !current.loading && !current.selectionError) return true;
    if (busy() || !(await guard.allow()) || !alive) return false;
    requestedId = id;
    const selected = await session.select(id);
    if (selected && live && notify) onPackageSelected?.(id);
    return selected;
  }

  listen(get("features"), "click", (event) => {
    const id = event.target.closest("[data-feature-id]")?.dataset.featureId;
    if (id) void selectFeature(id);
  });
  listen(get("selection-retry"), "click", () => {
    if (requestedId) void selectFeature(requestedId);
  });
  listen(get("filter-form"), "submit", (event) => event.preventDefault());

  for (const field of ["type", "status", "search"]) {
    listen(get(field), field === "search" ? "input" : "change", () => {
      clearTimeout(searchTimer);
      if (live && field === "search") {
        if (loadedPage) renderFeatureRows(loadedPage);
        return;
      }
      featureRequests.invalidate();
      featureRequestController?.abort();
      featurePage = 0;
      searchTimer = setTimeout(() => void loadFeatures(), field === "search" ? 180 : 0);
    });
  }

  for (const [name, direction] of [
    ["feature-prev", -1],
    ["feature-next", 1],
  ]) {
    listen(get(name), "click", () => {
      featurePage += direction;
      void loadFeatures();
    });
  }
  listen(get("feature-retry"), "click", () => void loadFeatures());

  listen(get("work-stream-mode"), "click", () => {
    if (!session.snapshot().feature) return;
    workStreamMode = toggleWorkStreamListMode(workStreamMode);
    workStreamRequests.invalidate();
    lastScopeKey = "";
    syncWorkStreamMode(session.snapshot());
    void loadWorkStreams();
  });

  listen(get("work-stream-retry"), "click", () => void loadWorkStreams());
  listen(get("abandon"), "click", () => {
    if (busy() || !session.snapshot().reconciliationRequired) return;
    if (
      window.confirm(
        "Discard this local draft and clear the Package selection? A timed-out Save may still complete on the server. This will not undo server changes."
      )
    ) {
      session.abandonUncertainDraft();
    }
  });
  listen(get("reconcile"), "click", async () => {
    if (busy()) return;
    await session.reconcile();
    if (alive) void loadFeatures();
  });
  listen(get("save"), "click", async () => {
    if (busy()) return;
    const saved = await session.save();
    if (alive && (saved || live)) void loadFeatures();
  });
  listen(mapRetryControl, "click", createMapRetryHandler(makeMap));
  listen(get("fail-load"), "click", () => {
    services.testing.failNext("load");
    get("test-status").textContent = "The next mock load will fail once.";
  });
  listen(get("fail-save"), "click", () => {
    services.testing.failNext("save");
    get("test-status").textContent = "The next Save will fail once.";
  });
  listen(get("reset"), "click", async () => {
    if (
      busy() ||
      !(await guard.allow()) ||
      !alive ||
      !window.confirm(
        "Reset this prototype's saved assignments and comments? Packages and preferences will be kept."
      )
    ) {
      return;
    }

    resetting = true;
    get("reset").disabled = true;
    session.clear();
    workStreamRequests.invalidate();
    featureRequests.invalidate();

    try {
      await services.assignments.reset();
      if (alive) {
        get("test-status").textContent = "Mock data reset.";
        void loadFeatures();
      }
    } catch (error) {
      if (alive) get("test-status").textContent = error.message;
    } finally {
      resetting = false;
      if (alive) get("reset").disabled = false;
    }
  });
  listen(window, "beforeunload", (event) => {
    if (
      session.snapshot().dirty ||
      session.snapshot().saving ||
      session.snapshot().reconciliationRequired
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  async function loadCategories() {
    if (!live) return;
    const isCurrent = categoryRequests.begin();
    try {
      const categories = await services.categories({ signal: abort.signal });
      if (!isCurrent()) return;
      get("category-status").textContent = "";
      const selected = get("type").value;
      get("type").replaceChildren(
        new Option("All categories", ""),
        ...categories.map((item) => new Option(item.name, item.id))
      );
      get("type").value = selected;
      get("type").title = "";
    } catch (error) {
      if (isCurrent())
        get("category-status").textContent = `Category filters unavailable: ${error.message}`;
    }
  }
  listen(get("feature-retry"), "click", () => void loadCategories());
  void loadCategories();
  void loadFeatures();

  return {
    element,
    activate() {
      if (!map) makeMap();
    },
    selectPackage(id, { notify = true } = {}) {
      return live ? selectFeature(id, { notify }) : Promise.resolve(false);
    },
    getSelectedPackageShortId(expectedId = null) {
      const feature = session.snapshot().feature;
      if (!live || !feature || (expectedId && feature.id !== expectedId)) return null;
      return typeof feature.shortId === "string" && feature.shortId.trim() ? feature.shortId : null;
    },
    hasUnsavedDraft() {
      return session.snapshot().dirty;
    },
    async allowLeave() {
      return !resetting && (await guard.allow());
    },
    destroy() {
      alive = false;
      categoryRequests.destroy();
      featureRequests.destroy();
      featureRequestController?.abort();
      packageSummaries.clear();
      workStreamRequests.destroy();
      mapGeneration++;
      clearTimeout(searchTimer);
      abort.abort();
      guard.destroy();
      unsubscribe();
      for (const row of workStreamRows.values()) row.destroy?.();
      workStreamRows.clear();
      session.destroy();
      map?.view?.ui?.remove?.(mapRetryControl);
      map?.destroy();
      basemapSelector?.destroy();
      element.remove();
    },
  };
}

function reconcileRows(container, nextRows, fallback) {
  const retained = new Set(nextRows);
  for (const child of [...container.children]) {
    if (!retained.has(child)) {
      // Move focus before removal so browser keyboard interaction is not interrupted by rerendering.
      if (child.contains(document.activeElement)) fallback.focus({ preventScroll: true });
      child.remove();
    }
  }

  nextRows.forEach((row, index) => {
    const existing = container.children[index];
    if (existing !== row) container.insertBefore(row, existing ?? null);
  });
}

export function createMapRetryHandler(retry) {
  return () => retry();
}
