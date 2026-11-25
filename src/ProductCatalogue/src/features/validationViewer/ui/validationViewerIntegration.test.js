import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createValidationViewerAction } from "./validationViewerAction.js";

// Exercise each actual route renderer, using the shared action's real identity
// guard. External Calcite registration and unrelated route services are omitted.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
  }
  children = [];
  dataset = {};
  attributes = {};
  textContent = "";
  className = "";
  append(...nodes) {
    this.children.push(...nodes);
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  addEventListener() {}
}
const document = {
  createElement: (tag) => new Element(tag),
  createDocumentFragment: () => new Element("fragment"),
};
const createAction = (artifact, name) =>
  createValidationViewerAction(artifact, name, { ownerDocument: document });
const appendValidationViewerAction = (parent, artifact, name) => {
  const action = createAction(artifact, name);
  if (action) parent.appendChild(action);
};
const id = "12345678-1234-1234-1234-123456789abc";
const artifact = {
  id,
  fileName: "Harbour.vld",
  datasetName: "Harbour",
  kind: "ValidationDiagnostic",
  url: `/electronicproducts/Harbour/artifacts/${id}`,
  productSpecificationLabel: "S-101",
};
function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}
function check(root, { hasView, url = artifact.url }) {
  const nodes = descendants(root);
  assert.ok(
    nodes.some((node) => ["a", "calcite-link"].includes(node.tagName) && node.href === url)
  );
  const actions = nodes.filter((node) => node.className === "pc-validation-viewer-action");
  assert.equal(actions.length, Number(hasView));
  if (hasView) assert.equal(actions[0].dataset.validationViewerKey, artifact.url);
}
async function loadRenderer(path, expression, context = {}) {
  const source = (await readFile(new URL(path, import.meta.url), "utf8"))
    .replace(/^import "[^"]+";\s*/gm, "")
    .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
    .replace(/export function/g, "function");
  return runInNewContext(`${source}\n${expression};`, {
    document,
    createValidationViewerAction: createAction,
    appendValidationViewerAction,
    ...context,
  });
}

test("Main Map preserves the download and adds a viewer only for the selected member's VLD", async () => {
  const render = await loadRenderer(
    "../../map/popups/createPopup.js",
    "createValidationArtifactLinks"
  );
  check(render([artifact], "Harbour"), { hasView: true });
  check(render([artifact], "Other"), { hasView: false });
  check(render([{ ...artifact, fileName: "shapes.zip" }], "Harbour"), { hasView: false });
});

test("Analyze retains downloads and excludes IC-ENC attachments and foreign members", async () => {
  const render = await loadRenderer(
    "../../analyze/ui/analyzeSidebar.js",
    "createInternalValidationReport"
  );
  const report = { title: artifact.fileName, url: artifact.url, raw: artifact, content: "" };
  check(render(report, 0, undefined, false, "Harbour"), { hasView: true });
  check(render(report, 0, undefined, true, "Harbour"), { hasView: false });
  check(render(report, 0, undefined, false, "Other"), { hasView: false });
});

test("Review uses internal validation scope and preserves exact historical artifact links", async () => {
  const types = { INTERNAL_VALIDATION_REPORTS: "internal", IC_ENC_REPORTS: "ic-enc" };
  const render = await loadRenderer(
    "../../review/ui/reviewBoard.js",
    "createValidationArtifactRow",
    { REVIEW_CONTENT_TYPES: types }
  );
  check(render(artifact, "Harbour", "internal"), { hasView: true });
  check(render(artifact, "Harbour", "ic-enc"), { hasView: false });
  check(render(artifact, "Other", "internal"), { hasView: false });
});

test("Dashboard reuses normalized artifact ownership and leaves other downloads unchanged", async () => {
  const render = await loadRenderer(
    "../../dashboard/ui/dashboardPage.js",
    `({ report, type, name }) => { dashboardReportPanelState = { reportType: type, datasetName: name }; return createDashboardReportItem(report); }`,
    { createDefaultDashboardFilters: () => ({}), formatDashboardRangeDateTime: (value) => value }
  );
  const report = { title: artifact.fileName, url: artifact.url, id, artifact };
  check(render({ report, type: "internal", name: "Harbour" }), { hasView: true });
  check(render({ report, type: "ic-enc", name: "Harbour" }), { hasView: false });
  check(render({ report, type: "internal", name: "Other" }), { hasView: false });
});

test("Main Map groups compact actions by exact artifact without repeating a single member filename", async () => {
  const render = await loadRenderer(
    "../../map/popups/createPopup.js",
    "createValidationArtifactLinks"
  );
  const zip = { ...artifact, fileName: "Harbour-validation-shapes.zip", url: "/shapes.zip" };
  const root = render([artifact, zip], "Harbour");
  assert.equal(root.children.length, 2);
  const [view, download] = root.children[0].children[0].children;
  assert.equal(view.textContent, "View report");
  assert.equal(download.href, artifact.url);
  assert.equal(download.download, artifact.fileName);
  assert.equal(download.attributes["aria-label"], `Download ${artifact.fileName}`);
  assert.equal(download.children[0].icon, "download");
  assert.equal(download.children[0].attributes["aria-hidden"], "true");
  assert.equal(root.children[1].children[0].children[0].textContent, "Download ZIP");
  const other = {
    ...artifact,
    fileName: "Earlier revision.vld",
    id: "abcdef12-1234-1234-1234-123456789abc",
    url: "/electronicproducts/Harbour/artifacts/abcdef12-1234-1234-1234-123456789abc",
  };
  const multiple = render([artifact, other], "Harbour");
  assert.deepEqual(
    multiple.children.map((row) => row.children[0].textContent),
    [artifact.fileName, other.fileName]
  );
  assert.equal(multiple.children[1].children[1].children[0].dataset.validationViewerKey, other.url);
  const unsupported = render([artifact], "Other");
  assert.equal(unsupported.children[0].children[0].children[0].textContent, artifact.fileName);
});

test("Dashboard places exact report actions in compact tiles and retains download-only files", async () => {
  const render = await loadRenderer(
    "../../dashboard/ui/dashboardPage.js",
    `({ reports, type, name }) => { dashboardReportPanelState = { reports, reportType: type, datasetName: name }; return createDashboardReportPanelContent(); }`,
    { createDefaultDashboardFilters: () => ({}), formatDashboardRangeDateTime: (value) => value }
  );
  const reports = [
    { title: artifact.fileName, url: artifact.url, id, artifact },
    { title: "Harbour-validation-shapes.zip", url: "/shapes.zip" },
    { title: "Earlier revision.vld", url: "/earlier.vld" },
  ];
  const fragment = render({ reports, type: "internal", name: "Harbour" });
  assert.equal(fragment.children.length, 1);
  const tiles = fragment.children[0];
  assert.equal(tiles.className, "pc-dashboard-report-tiles");
  assert.equal(tiles.children.length, reports.length);
  for (const [index, tile] of tiles.children.entries()) {
    assert.equal(tile.className, "pc-dashboard-report-tile");
    assert.equal(tile.children[0].textContent, reports[index].title);
    const actions = tile.children.at(-1);
    assert.equal(actions.className, "pc-dashboard-report-tile__actions");
    assert.equal(actions.children[0].href, reports[index].url);
    assert.equal(actions.children[0].className, "pc-dashboard-link-button");
    assert.equal(actions.children.length, index === 0 ? 2 : 1);
  }
  const icEnc = render({ reports, type: "ic-enc", name: "Harbour" });
  assert.equal(icEnc.children[0].children[0].children.at(-1).children.length, 1);
});
