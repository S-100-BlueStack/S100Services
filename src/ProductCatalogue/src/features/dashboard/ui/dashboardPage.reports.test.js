import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.events = new Map();
    this.dataset = {};
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => {
        const isEnabled = enabled === undefined ? !this.classes.has(name) : Boolean(enabled);
        if (isEnabled) this.classes.add(name);
        else this.classes.delete(name);
      },
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      contains: (name) => this.classes.has(name),
    };
    this.textContent = "";
    this.isConnected = true;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(event, handler) {
    this.events.set(event, handler);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  trigger(event) {
    this.events.get(event)?.();
  }
}

async function createHarness({ fetchReports = async () => ({ reports: [] }), fetchHistory } = {}) {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  const renderCalls = [];
  const keyboard = new Map();
  const page = new Element("main");
  let mountedPage = page;
  const fakeDocument = {
    createElement: (tagName) => new Element(tagName),
    createDocumentFragment: () => new Element("#fragment"),
    getElementById: (id) => (id === "product-dashboard-page" ? mountedPage : null),
    addEventListener: (name, callback) => keyboard.set(name, callback),
  };
  const result = runInNewContext(
    source
      .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
      .replace("export function", "function") +
      `\nrerenderDashboardPage = (focusState = null) => renderCalls.push(focusState);
        createActivityList = () => document.createElement("div");
        createSummaryRows = () => document.createElement("div");
        ({
          createActivityLinks, createActivityRow, createDashboardReportPanel,
          createDashboardGrid, openDashboardReports, closeDashboardReports,
          openDashboardHistory, closeDashboardHistory,
          ensureDashboardHistoryKeyboardHandlers,
          reportState: () => dashboardReportPanelState,
          historyState: () => dashboardHistoryState
        });`,
    {
      Error,
      Promise,
      document: fakeDocument,
      renderCalls,
      fetchDashboardValidationReports: fetchReports,
      fetchProductHistory: fetchHistory ?? (async () => ({ events: [] })),
      loadStatuses: async () => {},
      noticeError: () => {},
      createDefaultDashboardFilters: () => ({}),
      createProductHistoryStateMessage: ({ title, message }) => {
        const el = new Element("state");
        el.textContent = `${title}: ${message}`;
        return el;
      },
      createProductHistoryBanner: ({ title, message }) => {
        const el = new Element("banner");
        el.textContent = `${title}: ${message}`;
        return el;
      },
      formatDashboardRangeDateTime: (value) => value,
      buildReviewUrl: () => "/review",
      buildAnalyzeUrl: () => "/analyze",
      createStatusPill: () => new Element("status"),
    }
  );
  return {
    ...result,
    renderCalls,
    keyboard,
    page,
    replacePage: () => {
      mountedPage = new Element("main");
      return mountedPage;
    },
  };
}

function activity(overrides = {}) {
  return {
    id: "activity-1",
    datasetName: "Product A",
    timestamp: "2026-11-13T12:00:00Z",
    title: "Validation received",
    description: "New report",
    status: "completed",
    severity: "normal",
    type: "validation",
    actor: "Worker",
    details: [],
    links: {
      review: true,
      analyze: true,
      history: true,
      icEncReports: [],
      internalValidationReports: [],
    },
    ...overrides,
  };
}

function reportButton(links, label) {
  return visit(
    links,
    (element) =>
      element.tagName === "button" &&
      (element.textContent === label || element.textContent.startsWith(`${label} (`))
  )[0];
}

function visit(node, predicate, results = []) {
  if (predicate(node)) results.push(node);
  for (const child of node.children ?? []) visit(child, predicate, results);
  return results;
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("Dashboard report actions open the shared right-hand panel, never inline disclosures", async () => {
  const calls = [];
  const h = await createHarness({
    fetchReports: async (name, options) => {
      calls.push([name, options.reportType]);
      return { reports: [] };
    },
  });
  const item = activity();
  const buttons = h.createActivityLinks(item);
  const icEnc = reportButton(buttons, "IC-ENC");
  const validation = reportButton(buttons, "Validation");

  assert.equal(buttons.tagName, "div");
  assert.deepEqual(
    Array.from(buttons.children, (child) => child.textContent || child.tagName),
    ["History", "IC-ENC", "Validation", "calcite-dropdown"]
  );
  assert.equal(icEnc.tagName, "button");
  assert.equal(icEnc.getAttribute("aria-pressed"), "false");
  assert.equal(validation.tagName, "button");
  assert.equal(calls.length, 0);
  icEnc.trigger("click");
  assert.equal(h.reportState().isOpen, true);
  assert.equal(h.reportState().loading, true);
  assert.equal(icEnc.textContent, "IC-ENC");
  assert.equal(h.historyState().isOpen, false);
  await flush();
  assert.deepEqual(calls, [["Product A", "ic-enc"]]);
  const panel = h.createDashboardReportPanel();
  assert.equal(panel.getAttribute("aria-label"), "IC-ENC reports");
  assert.equal(panel.className, "pc-dashboard-panel pc-dashboard-history-panel");
  assert.match(visit(panel, (node) => node.tagName === "state")[0].textContent, /No reports found/);
  const active = reportButton(h.createActivityLinks(item), "IC-ENC");
  assert.equal(active.textContent, "IC-ENC");
  assert.equal(active.getAttribute("aria-pressed"), "true");
  assert.match(active.getAttribute("aria-label"), /Close IC-ENC reports/);
  active.trigger("click");
  assert.equal(h.reportState().isOpen, false);
  assert.equal(h.renderCalls.at(-1).panelAction, "ic-enc:id:activity-1");
  assert.equal(calls.length, 1);
});

test("The right column swaps summary panels for the selected report type and restores them on close", async () => {
  const h = await createHarness();
  const item = activity();
  const gridArgs = {
    dashboard: { range: {}, activities: [], statusSummary: [], operationSummary: [] },
    filters: {},
  };
  const initialAside = h.createDashboardGrid(gridArgs).children[1];
  assert.equal(initialAside.children.length, 1);
  assert.equal(initialAside.children[0].className, "pc-dashboard-overview-row");
  assert.equal(initialAside.children[0].children.length, 2);
  assert.equal(initialAside.classList.contains("has-history-panel"), false);

  await h.openDashboardReports(item, "internal");
  const reportAside = h.createDashboardGrid(gridArgs).children[1];
  assert.equal(reportAside.children.length, 1);
  assert.equal(reportAside.children[0].getAttribute("aria-label"), "Validation reports");
  assert.equal(reportAside.classList.contains("has-history-panel"), true);
  h.closeDashboardReports();
  const restoredAside = h.createDashboardGrid(gridArgs).children[1];
  assert.equal(restoredAside.children.length, 1);
  assert.equal(restoredAside.children[0].className, "pc-dashboard-overview-row");
  assert.equal(restoredAside.children[0].children.length, 2);
  assert.equal(restoredAside.classList.contains("has-history-panel"), false);
  assert.equal(h.renderCalls.at(-1).panelAction, "internal:id:activity-1");
});

test("Opening an activity with direct URLs retains all links without a redundant artifact request", async () => {
  const calls = [];
  const h = await createHarness({
    fetchReports: async () => {
      calls.push("fetch");
    },
  });
  await h.openDashboardReports(
    activity({
      links: {
        history: true,
        icEncReports: [
          { title: "One", url: "/reports/one" },
          { title: "Two", url: "/reports/two" },
          { title: "Missing URL" },
        ],
      },
    }),
    "ic-enc"
  );
  assert.equal(calls.length, 0);
  const panel = h.createDashboardReportPanel();
  assert.deepEqual(
    visit(panel, (node) => node.tagName === "a").map((link) => link.href),
    ["/reports/one", "/reports/two"]
  );
  assert.ok(
    visit(panel, (node) => node.tagName === "a").every((link) => link.rel === "noopener noreferrer")
  );
  assert.match(visit(panel, (node) => node.tagName === "banner")[0].textContent, /unavailable/);
});

test("On-demand report fetch renders all returned files and exclusion warnings inside the panel", async () => {
  const calls = [];
  const h = await createHarness({
    fetchReports: async (name, { reportType }) => {
      calls.push([name, reportType]);
      return {
        reports: [
          { title: "First.xml", url: "/files/first", generatedAt: "2026-11-12" },
          { title: "Second.xml", url: "/files/second" },
        ],
        hasUnknownKinds: true,
        hasUnattributedArtifacts: false,
      };
    },
  });
  await h.openDashboardReports(activity(), "internal");
  assert.deepEqual(calls, [["Product A", "internal"]]);
  const panel = h.createDashboardReportPanel();
  assert.deepEqual(
    visit(panel, (node) => node.tagName === "a").map((link) => link.href),
    ["/files/first", "/files/second"]
  );
  assert.ok(visit(panel, (node) => node.textContent === "First.xml").length > 0);
  assert.match(visit(panel, (node) => node.tagName === "banner")[0].textContent, /excluded/);
});

test("Switching IC-ENC to Validation ignores a late IC-ENC response", async () => {
  const requests = [];
  const h = await createHarness({
    fetchReports: (_, { reportType }) =>
      new Promise((resolve) => requests.push({ reportType, resolve })),
  });
  const item = activity();
  const first = h.openDashboardReports(item, "ic-enc");
  const second = h.openDashboardReports(item, "internal");
  assert.deepEqual(
    requests.map(({ reportType }) => reportType),
    ["ic-enc", "internal"]
  );

  requests[1].resolve({ reports: [{ title: "Current", url: "/files/current" }] });
  await second;
  requests[0].resolve({ reports: [{ title: "Stale", url: "/files/stale" }] });
  await first;
  assert.equal(h.reportState().reportType, "internal");
  assert.deepEqual(
    h.reportState().reports.map((item) => item.url),
    ["/files/current"]
  );
});

test("Close and reopen invalidates old requests and Escape restores the report action", async () => {
  const requests = [];
  const h = await createHarness({
    fetchReports: () => new Promise((resolve) => requests.push(resolve)),
  });
  h.ensureDashboardHistoryKeyboardHandlers();
  const first = h.openDashboardReports(activity(), "ic-enc");
  h.keyboard.get("keydown")({ key: "Escape" });
  assert.equal(h.reportState().isOpen, false);
  assert.equal(h.renderCalls.at(-1).panelAction, "ic-enc:id:activity-1");
  const second = h.openDashboardReports(activity(), "ic-enc");
  requests[0]({ reports: [{ url: "/stale" }] });
  await first;
  assert.equal(h.reportState().loading, true);
  requests[1]({ reports: [{ url: "/current" }] });
  await second;
  assert.equal(h.reportState().reports[0].url, "/current");
});

test("Opening History invalidates a pending report request", async () => {
  const requests = [];
  const h = await createHarness({
    fetchReports: () => new Promise((resolve) => requests.push(resolve)),
  });
  const first = h.openDashboardReports(activity(), "internal");
  const history = h.openDashboardHistory(activity());
  assert.equal(h.reportState().isOpen, false);
  assert.equal(h.historyState().isOpen, true);
  requests[0]({ reports: [{ url: "/stale" }] });
  await Promise.all([first, history]);
  assert.equal(h.reportState().isOpen, false);
  assert.equal(h.historyState().isOpen, true);
});

test("Backend errors remain visible, and reopening after a toggle-close retries explicitly", async () => {
  let calls = 0;
  const h = await createHarness({
    fetchReports: async () => {
      calls += 1;
      if (calls === 1) throw new Error("Artifact service unavailable");
      return { reports: [{ url: "/retry", title: "Recovered" }] };
    },
  });
  await h.openDashboardReports(activity(), "ic-enc");
  assert.match(
    visit(h.createDashboardReportPanel(), (node) => node.tagName === "state")[0].textContent,
    /Artifact service unavailable/
  );
  await h.openDashboardReports(activity(), "ic-enc");
  assert.equal(h.reportState().isOpen, false);
  assert.equal(calls, 1);
  await h.openDashboardReports(activity(), "ic-enc");
  assert.equal(calls, 2);
  assert.equal(h.reportState().reports[0].url, "/retry");
});

test("Clicking the active report while loading closes without duplicate requests or stale results", async () => {
  const requests = [];
  const h = await createHarness({
    fetchReports: () => new Promise((resolve) => requests.push(resolve)),
  });
  const item = activity();
  const first = h.openDashboardReports(item, "ic-enc");
  assert.equal(h.reportState().isOpen, true);
  await h.openDashboardReports(item, "ic-enc");
  assert.equal(h.reportState().isOpen, false);
  assert.equal(h.renderCalls.at(-1).panelAction, "ic-enc:id:activity-1");
  assert.equal(requests.length, 1);
  requests[0]({ reports: [{ title: "Stale", url: "/stale" }] });
  await first;
  assert.equal(h.reportState().reports.length, 0);
  const second = h.openDashboardReports(item, "ic-enc");
  assert.equal(requests.length, 2);
  requests[1]({ reports: [{ title: "Current", url: "/current" }] });
  await second;
  assert.equal(h.reportState().reports[0].url, "/current");
});

test("Clicking the same History action toggles the panel closed and suppresses stale history", async () => {
  const requests = [];
  const h = await createHarness({
    fetchHistory: () => new Promise((resolve) => requests.push(resolve)),
  });
  const item = activity();
  const first = h.openDashboardHistory(item);
  await flush();
  assert.equal(requests.length, 1);
  await h.openDashboardHistory(item);
  assert.equal(h.historyState().isOpen, false);
  assert.equal(h.renderCalls.at(-1).panelAction, "history:id:activity-1");
  requests[0]({ events: [{ id: "old" }] });
  await first;
  assert.equal(h.historyState().history, null);
  assert.equal(h.reportState().isOpen, false);
});

test("Detached Dashboard pages ignore late report completions and allow a new request", async () => {
  const requests = [];
  const h = await createHarness({
    fetchReports: () => new Promise((resolve) => requests.push(resolve)),
  });
  const first = h.openDashboardReports(activity(), "internal");
  h.page.isConnected = false;
  requests[0]({ reports: [{ url: "/detached" }] });
  await first;
  assert.equal(h.reportState().loading, true);
  assert.equal(h.reportState().reports.length, 0);
  // A new page must use a new request even while the detached panel's loading flag remains set.
  const newPage = h.replacePage();
  const second = h.openDashboardReports(activity(), "internal");
  assert.equal(requests.length, 2);
  requests[1]({ reports: [{ url: "/current" }] });
  await second;
  assert.equal(newPage.isConnected, true);
  assert.equal(h.reportState().reports[0].url, "/current");
});

test("Activity rows retain complete backend metadata while presenting a single compact details line", async () => {
  const h = await createHarness();
  const row = h.createActivityRow(
    activity({
      title: "Ready for distribution",
      description: "The candidate has completed validation.",
      details: [
        { label: "Source state", value: "ReadyForDistribution" },
        { label: "Edition", value: "3" },
        { label: "Owner", value: "SYSTEM" },
      ],
    }),
    "Europe/Copenhagen"
  );
  const cell = row.children[2];
  assert.equal(cell.children.length, 3);
  assert.equal(
    cell.children[2].textContent,
    "Source state: ReadyForDistribution · Edition: 3 · Owner: SYSTEM"
  );
  assert.match(cell.title, /Ready for distribution/);
  assert.match(cell.title, /Owner: SYSTEM/);
});

test("Direct panel toggles retain one-click close while Links contains only navigation", async () => {
  const h = await createHarness();
  const item = activity();
  const actions = h.createActivityLinks(item);
  assert.match(actions.className, /(?:^|\s)pc-dashboard-activity-actions(?:\s|$)/);
  assert.match(actions.className, /(?:^|\s)pc-dashboard-activity-links(?:\s|$)/);
  const [history, icEnc, validation, dropdown] = actions.children;
  assert.deepEqual(
    [history.textContent, icEnc.textContent, validation.textContent],
    ["History", "IC-ENC", "Validation"]
  );
  assert.deepEqual(
    [
      history.getAttribute("aria-pressed"),
      icEnc.getAttribute("aria-pressed"),
      validation.getAttribute("aria-pressed"),
    ],
    ["false", "false", "false"]
  );
  assert.equal(dropdown.tagName, "calcite-dropdown");
  assert.equal(dropdown.getAttribute("overlay-positioning"), "fixed");
  assert.equal(dropdown.getAttribute("width"), "s");
  assert.equal(dropdown.children[0].textContent, "Links");
  assert.equal(dropdown.children[0].dataset.dashboardFocusKey, "links:menu:id:activity-1");
  const group = dropdown.children[1];
  assert.equal(group.getAttribute("selection-mode"), "none");
  const entries = group.children;
  assert.deepEqual(
    Array.from(entries, (entry) => entry.textContent),
    ["Review", "Analyze"]
  );
  assert.equal(entries[0].href, "/review");
  assert.equal(entries[1].href, "/analyze");
  assert.ok(
    entries.every((entry) => entry.target === "_blank" && entry.rel === "noopener noreferrer")
  );

  history.trigger("click");
  await flush();
  assert.equal(h.historyState().isOpen, true);
  const activeActions = h.createActivityLinks(item);
  assert.equal(activeActions.children[0].getAttribute("aria-pressed"), "true");
  assert.match(activeActions.children[0].getAttribute("aria-label"), /Close History/);
  activeActions.children[0].trigger("click");
  assert.equal(h.historyState().isOpen, false);
  assert.equal(h.renderCalls.at(-1).panelAction, "history:id:activity-1");

  const unavailable = h.createActivityLinks(
    activity({
      datasetName: null,
      links: {
        review: false,
        analyze: false,
        history: false,
        icEncReports: [],
        internalValidationReports: [],
      },
    })
  );
  assert.ok(unavailable.children.slice(0, 3).every((button) => button.disabled));
  assert.ok(unavailable.children[3].children[1].children.every((entry) => entry.disabled));
  assert.equal(unavailable.children[3].children[0].disabled, true);

  const analyzeOnly = h.createActivityLinks(
    activity({
      links: {
        review: false,
        analyze: true,
        history: true,
        icEncReports: [],
        internalValidationReports: [],
      },
    })
  );
  assert.equal(analyzeOnly.children[3].children[0].disabled, false);
  assert.equal(analyzeOnly.children[3].children[1].children[0].disabled, true);
  assert.equal(analyzeOnly.children[3].children[1].children[1].disabled, false);
});

test("Direct Validation toggle switches panel ownership and discards a late report response", async () => {
  const requests = [];
  const h = await createHarness({
    fetchReports: () => new Promise((resolve) => requests.push(resolve)),
  });
  const item = activity();
  h.createActivityLinks(item).children[0].trigger("click");
  await flush();
  assert.equal(h.historyState().isOpen, true);

  h.createActivityLinks(item).children[2].trigger("click");
  assert.equal(h.historyState().isOpen, false);
  assert.equal(h.reportState().isOpen, true);
  assert.equal(h.reportState().reportType, "internal");
  assert.equal(requests.length, 1);
  const active = h.createActivityLinks(item).children[2];
  assert.equal(active.getAttribute("aria-pressed"), "true");
  active.trigger("click");
  assert.equal(h.reportState().isOpen, false);
  assert.equal(h.renderCalls.at(-1).panelAction, "internal:id:activity-1");

  requests[0]({ reports: [{ url: "/obsolete" }] });
  await flush();
  assert.equal(h.reportState().isOpen, false);
  assert.equal(h.reportState().reports.length, 0);
});

test("Escape inside an open action dropdown does not unexpectedly close a report panel", async () => {
  const h = await createHarness();
  await h.openDashboardReports(activity(), "ic-enc");
  h.ensureDashboardHistoryKeyboardHandlers();
  h.keyboard.get("keydown")({
    key: "Escape",
    composedPath: () => [{ tagName: "calcite-dropdown" }],
  });
  assert.equal(h.reportState().isOpen, true);
  h.keyboard.get("keydown")({ key: "Escape", composedPath: () => [] });
  assert.equal(h.reportState().isOpen, false);
});
