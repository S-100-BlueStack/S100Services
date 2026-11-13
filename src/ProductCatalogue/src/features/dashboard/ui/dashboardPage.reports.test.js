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
  return links.children.find((element) => element.textContent.startsWith(label));
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

  assert.equal(icEnc.tagName, "button");
  assert.equal(validation.tagName, "button");
  assert.equal(calls.length, 0);
  icEnc.trigger("click");
  assert.equal(h.reportState().isOpen, true);
  assert.equal(h.reportState().loading, true);
  assert.equal(icEnc.getAttribute("aria-pressed"), "false");
  assert.equal(h.historyState().isOpen, false);
  await flush();
  assert.deepEqual(calls, [["Product A", "ic-enc"]]);
  const panel = h.createDashboardReportPanel();
  assert.equal(panel.getAttribute("aria-label"), "IC-ENC reports");
  assert.equal(panel.className, "pc-dashboard-panel pc-dashboard-history-panel");
  assert.match(visit(panel, (node) => node.tagName === "state")[0].textContent, /No reports found/);
  assert.equal(
    reportButton(h.createActivityLinks(item), "IC-ENC").getAttribute("aria-pressed"),
    "true"
  );
});

test("The right column swaps summary panels for the selected report type and restores them on close", async () => {
  const h = await createHarness();
  const item = activity();
  const gridArgs = {
    dashboard: { range: {}, activities: [], statusSummary: [], operationSummary: [] },
    filters: {},
  };
  const initialAside = h.createDashboardGrid(gridArgs).children[1];
  assert.equal(initialAside.children.length, 2);
  assert.equal(initialAside.classList.contains("has-history-panel"), false);

  await h.openDashboardReports(item, "internal");
  const reportAside = h.createDashboardGrid(gridArgs).children[1];
  assert.equal(reportAside.children.length, 1);
  assert.equal(reportAside.children[0].getAttribute("aria-label"), "Validation reports");
  assert.equal(reportAside.classList.contains("has-history-panel"), true);
  h.closeDashboardReports();
  const restoredAside = h.createDashboardGrid(gridArgs).children[1];
  assert.equal(restoredAside.children.length, 2);
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

test("Backend errors remain visible in the panel; retry is an explicit subsequent open", async () => {
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
  assert.equal(calls, 2);
  assert.equal(h.reportState().reports[0].url, "/retry");
});

test("Repeated activation during loading does not issue duplicate requests", async () => {
  const requests = [];
  const h = await createHarness({
    fetchReports: () => new Promise((resolve) => requests.push(resolve)),
  });
  const first = h.openDashboardReports(activity(), "ic-enc");
  await h.openDashboardReports(activity(), "ic-enc");
  assert.equal(requests.length, 1);
  requests[0]({ reports: [{ title: "Ready", url: "/ready" }] });
  await first;
  assert.equal(h.reportState().reports[0].url, "/ready");
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
