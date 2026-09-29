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

export function createAssignmentPage({ services, createMap, runtimeConfig }) {
  const element = document.createElement("main");
  element.className = "dc-assignment-page";
  element.id = "data-catalogue-feature-assignment";
  element.setAttribute("aria-label", "Feature assignment prototype");
  element.innerHTML = `
    <div class="dc-assignment-column dc-assignment-column--left">
      <section class="dc-assignment-panel dc-feature-panel" aria-label="Feature assignment">
        <form class="dc-assignment-toolbar" data-filter-form>
          <label>Type<select data-type><option value="">All types</option><option>NM</option><option>KP</option></select></label>
          <label>Status<select data-status><option value="">All statuses</option><option>Assigned</option><option>Not assigned</option></select></label>
          <label class="dc-assignment-grow">Feature name<input type="search" data-search placeholder="Search NM / KP" autocomplete="off"></label>
        </form>
        <p data-list-status role="status"></p>
        <div class="dc-assignment-scroll" data-features></div>
        <footer class="dc-assignment-toolbar"><button type="button" data-feature-prev>Previous</button><span data-feature-page></span><button type="button" data-feature-next>Next</button><button type="button" data-feature-retry>Reload list</button></footer>
      </section>
      <section class="dc-assignment-panel dc-information-panel" aria-label="Feature information">
        <p data-selection-status role="status">Select a Feature to view its information.</p>
        <button type="button" data-selection-retry hidden>Retry Feature</button>
        <div class="dc-assignment-scroll" data-information></div>
      </section>
    </div>
    <div class="dc-assignment-column dc-assignment-column--right">
      <section class="dc-assignment-panel dc-work-stream-panel" data-work-stream-panel aria-label="Work stream assignments">
        <div class="dc-assignment-toolbar dc-assignment-panel-toolbar">
          <span data-draft-status role="status"></span>
          <span class="dc-assignment-muted" data-active-count></span>
          <span class="dc-assignment-toolbar-spacer"></span>
          <button type="button" data-work-stream-mode aria-pressed="false">Show active</button>
          <button type="button" data-save disabled>Save</button>
        </div>
        <p data-save-error role="alert"></p>
        <p data-work-stream-status role="status">Select a Feature to edit assignments.</p>
        <div class="dc-assignment-scroll" data-work-streams></div>
        <div class="dc-assignment-toolbar dc-work-stream-reload">
          <button type="button" data-work-stream-retry>Reload Work streams</button>
        </div>
      </section>
      <section class="dc-assignment-panel dc-assignment-map-panel" aria-label="Assignment map">
        <p data-map-empty>Select a Feature to focus its geometry.</p>
        <div class="dc-assignment-map-stage">
          <div class="dc-assignment-map" data-map></div>
          <button class="dc-assignment-map-retry" type="button" data-map-retry aria-label="Retry map" title="Retry map">
            <calcite-icon icon="refresh" scale="s" aria-hidden="true"></calcite-icon>
          </button>
        </div>
        <p data-map-status role="status"></p>
        <div class="dc-assignment-legend" aria-label="Assignment map legend">
          <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__feature" aria-hidden="true"></span>Selected Feature</span>
          <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-assigned" aria-hidden="true"></span>Assigned Work stream</span>
          <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-context" aria-hidden="true"></span>Unassigned context</span>
          <span class="dc-assignment-muted">Map reflects draft assignments</span>
        </div>
      </section>
    </div>
    <footer class="dc-prototype-toolbar dc-assignment-toolbar"><span>Mock data · Prototype user · Saved comments are immutable</span><button type="button" data-fail-load>Fail next load</button><button type="button" data-fail-save>Fail next save</button><button type="button" data-reset>Reset mock data</button><span data-test-status role="status"></span></footer>`;

  const get = createRequiredTargetGetter((name) => element.querySelector(`[data-${name}]`));
  const abort = new AbortController();
  const listen = (node, name, handler) =>
    node.addEventListener(name, handler, { signal: abort.signal });
  const session = createAssignmentSession({ services });
  let alive = true;
  const featureRequests = createQueryLifecycle();
  const workStreamRequests = createQueryLifecycle();
  let featurePage = 0;
  let workStreamMode = WORK_STREAM_LIST_MODE.ALL;
  let currentQuery = {};
  let displayedId = null;
  let requestedId = null;
  let rows = [];
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
    onSaved: () => void loadFeatures(),
  });

  function busy() {
    return resetting || session.snapshot().saving;
  }

  function makeMap() {
    map?.destroy();
    map = null;
    const current = ++mapGeneration;
    lastAssignmentKey = "";

    try {
      map = createMap({
        container: get("map"),
        runtimeConfig,
        workStreams: services.workStreams,
        onStatus(message) {
          if (alive && current === mapGeneration) get("map-status").textContent = message;
        },
      });
      syncMap(session.snapshot());
    } catch {
      get("map-status").textContent = "Map initialization failed. Retry map when ready.";
    }
  }

  function syncMap(state) {
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
      search: get("search").value,
      page: featurePage,
      pageSize: 25,
    };
  }

  async function loadFeatures() {
    clearTimeout(searchTimer);
    const isCurrent = featureRequests.begin();
    const query = filterQuery();
    currentQuery = query;
    get("list-status").textContent = "Loading Features…";
    get("feature-prev").disabled = true;
    get("feature-next").disabled = true;
    get("features").setAttribute("aria-busy", "true");

    try {
      const result = await services.features.search(query);
      if (!isCurrent()) return;
      featurePage = result.page;
      const nextRows = [];

      for (const feature of result.items) {
        let button = featureRows.get(feature.id);
        if (!button) {
          button = document.createElement("button");
          featureRows.set(feature.id, button);
        }
        button.type = "button";
        button.className = "dc-feature-row";
        button.dataset.featureId = feature.id;
        const name = document.createElement("span");
        name.textContent = feature.name;
        const status = document.createElement("span");
        status.className = `dc-assignment-status ${feature.status === "Assigned" ? "is-assigned" : "is-unassigned"}`;
        status.textContent = feature.status;
        button.replaceChildren(name, status);
        nextRows.push(button);
      }

      reconcileRows(get("features"), nextRows, get("search"));
      const visibleIds = new Set(result.items.map((item) => item.id));
      for (const id of featureRows.keys()) {
        if (!visibleIds.has(id)) featureRows.delete(id);
      }

      get("list-status").textContent =
        `${result.total} Features${result.total ? "" : " — no matches"}`;
      get("feature-page").textContent = result.total
        ? `Page ${result.page + 1} of ${Math.ceil(result.total / result.pageSize)}`
        : "No results";
      get("feature-prev").disabled = !result.page;
      get("feature-next").disabled = (result.page + 1) * result.pageSize >= result.total;
      syncSelection(session.snapshot());
    } catch (error) {
      if (isCurrent()) {
        get("list-status").textContent = error.message;
        get("features").replaceChildren();
      }
    } finally {
      if (isCurrent()) get("features").setAttribute("aria-busy", "false");
    }
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

  async function loadWorkStreams() {
    const isCurrent = workStreamRequests.begin();
    const state = session.snapshot();
    if (!state.feature) return;

    const scopedIds = workStreamIds(state);
    lastScopeKey = JSON.stringify([state.feature.id, workStreamMode, scopedIds]);
    get("work-stream-status").textContent = "Loading Work streams…";

    try {
      const result = await services.workStreams.list({ ids: scopedIds });
      if (!isCurrent() || state.feature.id !== session.snapshot().feature?.id) return;

      rows = result.items.map((workStream) => {
        if (!workStreamRows.has(workStream.id)) {
          workStreamRows.set(workStream.id, createWorkStreamRow(workStream, session));
        }
        return workStreamRows.get(workStream.id);
      });

      const latest = session.snapshot();
      for (const row of rows) row.update(latest);
      reconcileRows(
        get("work-streams"),
        rows.map((row) => row.element),
        get("work-stream-mode")
      );

      const visibleIds = new Set(result.items.map((item) => item.id));
      for (const id of workStreamRows.keys()) {
        if (!visibleIds.has(id)) workStreamRows.delete(id);
      }

      get("work-stream-status").textContent = result.total
        ? `${result.total} Work streams. Any Work stream may be assigned.`
        : workStreamMode === WORK_STREAM_LIST_MODE.ACTIVE
          ? "No active Work stream assignments."
          : "No Work streams are available.";
    } catch (error) {
      if (isCurrent()) {
        get("work-stream-status").textContent = error.message;
        rows = [];
        get("work-streams").replaceChildren();
      }
    }
  }

  function syncSelection(state) {
    for (const button of get("features").querySelectorAll("[data-feature-id]")) {
      button.setAttribute("aria-pressed", String(button.dataset.featureId === state.feature?.id));
    }

    if (state.feature) {
      const matches = matchesFeature(
        { ...state.feature, status: assignmentStatus(state.record) },
        currentQuery
      );
      get("selection-status").textContent =
        `${state.feature.name} · ${assignmentStatus(state.record)}${matches ? "" : " · Outside the current filter; your editing context remains open."}`;
    }
  }

  function renderInformation(feature) {
    get("information").replaceChildren();
    if (!feature) return;

    const dl = document.createElement("dl");
    for (const [label, value] of [
      ["ID", feature.sourceId],
      ["Title", feature.title],
      ["References", feature.references],
      ["Details", feature.details],
      ["Nautical charts", feature.nauticalCharts],
      ["Publication", feature.publication],
    ]) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value || "Not provided";
      dd.className = "dc-assignment-text";
      dl.append(dt, dd);
    }
    get("information").append(dl);
  }

  const unsubscribe = session.subscribe((state) => {
    get("save").disabled =
      !state.dirty || state.saving || resetting || Boolean(state.validationError);
    get("save").textContent = state.saving ? "Saving…" : "Save";
    get("draft-status").textContent = state.feature
      ? state.validationError
        ? "Draft needs attention"
        : state.dirty
          ? "Unsaved changes"
          : "Saved state"
      : "";
    get("save-error").textContent = state.feature ? state.error || state.validationError : "";
    get("selection-status").textContent = state.loading
      ? "Loading Feature…"
      : state.error || "Select a Feature to view its information.";
    get("selection-retry").hidden = !state.error || Boolean(state.feature);
    get("work-stream-panel").setAttribute(
      "aria-label",
      state.feature
        ? `Work stream assignments for ${state.feature.name}`
        : "Work stream assignments"
    );
    get("active-count").textContent = state.draft
      ? `${state.draft.activeIds.length} active · ${state.draft.comments.length} draft comments`
      : "";
    get("map-empty").hidden = Boolean(state.feature);
    get("work-stream-mode").disabled = !state.feature || resetting;
    get("work-stream-retry").disabled = !state.feature || resetting;
    get("reset").disabled = state.saving || resetting;

    syncWorkStreamMode(state);
    syncSelection(state);
    syncMap(state);

    const id = state.feature?.id ?? null;
    if (displayedId !== id) {
      displayedId = id;
      workStreamRequests.invalidate();
      rows = [];
      workStreamRows.clear();
      get("work-streams").replaceChildren();
      renderInformation(state.feature);
      get("work-stream-status").textContent = "Select a Feature to edit assignments.";
      lastScopeKey = "";
    }

    if (state.feature) {
      // Text edits patch existing controls so browser focus and selection remain stable.
      for (const row of rows) row.update(state);
      const scope = JSON.stringify([state.feature.id, workStreamMode, workStreamIds(state)]);
      if (scope !== lastScopeKey) {
        lastScopeKey = scope;
        void loadWorkStreams();
      }
    }
  });

  async function selectFeature(id) {
    if (busy() || id === session.snapshot().feature?.id || !(await guard.allow()) || !alive) {
      return;
    }

    requestedId = id;
    await session.select(id);
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
      featureRequests.invalidate();
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
  listen(get("save"), "click", async () => {
    if (!busy() && (await session.save()) && alive) void loadFeatures();
  });
  listen(get("map-retry"), "click", createMapRetryHandler(makeMap));
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
        "Reset this prototype's saved assignments and comments? Jobs and preferences will be kept."
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
    if (session.snapshot().dirty || session.snapshot().saving) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  void loadFeatures();

  return {
    element,
    activate() {
      if (!map) makeMap();
    },
    async allowLeave() {
      return !resetting && (await guard.allow());
    },
    destroy() {
      alive = false;
      featureRequests.destroy();
      workStreamRequests.destroy();
      mapGeneration++;
      clearTimeout(searchTimer);
      abort.abort();
      guard.destroy();
      unsubscribe();
      session.destroy();
      map?.destroy();
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
