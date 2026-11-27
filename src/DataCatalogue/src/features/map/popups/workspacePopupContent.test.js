import assert from "node:assert/strict";
import test from "node:test";
import {
  createCatalogueService,
  normalizeWorkspace,
} from "../../../shared/api/catalogueService.js";
import { loadWorkspaceOverview } from "../../../shared/api/loadWorkspaceOverview.js";
import {
  createWorkspaceGeometrySource,
  hasSameWorkspaceOverviewGeometry,
} from "../workspaces/createWorkspaceGeometrySource.js";
import { createWorkspaceOverlay } from "../workspaces/createWorkspaceOverlay.js";
import { createWorkspacePopup } from "./workspacePopupContent.js";

class CustomContent {
  constructor(properties) {
    Object.assign(this, properties);
  }
}

function createPopup() {
  return createWorkspacePopup({ CustomContent });
}

function popupContent(template, graphic) {
  return template.content[0].creator({ graphic });
}

async function withDocument(callback) {
  const prior = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      const attributes = new Map();
      let value = "";
      return {
        tagName,
        className: "",
        get textContent() {
          return this.children.length
            ? this.children.map((node) => node.textContent).join("")
            : value;
        },
        set textContent(next) {
          this.children = [];
          value = next;
        },
        children: [],
        disabled: false,
        setAttribute(name, value) {
          attributes.set(name, String(value));
        },
        getAttribute(name) {
          return attributes.get(name) ?? null;
        },
        replaceChildren(...nodes) {
          this.textContent = "";
          this.append(...nodes);
        },
        append(...nodes) {
          this.children.push(...nodes);
        },
      };
    },
  };
  try {
    return await callback();
  } finally {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  }
}

function details(content) {
  return content.children[1].children[1].children
    .filter((row) => !row.hidden)
    .map((row) => row.children.map((cell) => cell.textContent));
}

test("native Workspace title owns the only header and close button", () => {
  return withDocument(() => {
    const template = createPopup().template;
    const graphic = { attributes: { workspaceName: "DK20149C", pipelineName: "ENC", openJobs: 5 } };
    const content = popupContent(template, graphic);
    assert.equal(template.title({ graphic }), "DK20149C");
    assert.deepEqual(template.actions, []);
    assert.equal(template.overwriteActions, true);
    assert.equal(content.className, "dc-workspace-popup");
    assert.deepEqual(
      content.children.map((child) => child.className),
      ["dc-workspace-popup__actions", "dc-workspace-popup__information"]
    );
    assert.equal(
      content.children.some((child) => child.tagName === "header"),
      false
    );
    assert.deepEqual(details(content), [
      ["Workstream", "ENC"],
      ["Open packages", "5"],
    ]);
  });
});

test("Take workspace is disabled and an absent snapshot shows unavailable ownership", () => {
  return withDocument(() => {
    const content = popupContent(createPopup().template, {
      attributes: { workspaceName: "Example", lockOwner: "Unverified value" },
    });
    const [take, owner] = content.children[0].children;
    assert.equal(take.tagName, "button");
    assert.equal(take.disabled, true);
    assert.equal(take.type, "button");
    assert.equal(take.children[0].getAttribute("icon"), "hammer-lock");
    assert.equal(take.children[1].textContent, "Take workspace");
    assert.equal(take.onclick, undefined);
    assert.equal(owner.children[0].textContent, "Workspace owner: ");
    assert.equal(owner.children[1].textContent, "Unavailable");
    assert.match(take.title, /unavailable/);
    assert.deepEqual(details(content), [["Workstream", "Unavailable"]]);
  });
});

test("missing counts are omitted instead of invented as zero", () => {
  return withDocument(() => {
    for (const count of [null, undefined, -1, 2.5, "5", Number.MAX_SAFE_INTEGER + 1]) {
      const content = popupContent(createPopup().template, {
        attributes: { workspaceId: "workspace-1", pipelineId: "pipeline-1", openJobs: count },
      });
      assert.deepEqual(details(content), [["Workstream", "pipeline-1"]]);
    }
    const content = popupContent(createPopup().template, {
      attributes: { openJobs: 0 },
    });
    assert.deepEqual(details(content), [
      ["Workstream", "Unavailable"],
      ["Open packages", "0"],
    ]);
  });
});

test("backend names cannot inject markup into native title or app-owned content", () => {
  return withDocument(() => {
    const name = '<img src="x" onerror="alert(1)">';
    const pipeline = "<script>bad()</script>";
    const graphic = { attributes: { workspaceName: name, pipelineName: pipeline, openJobs: 1 } };
    const template = createPopup().template;
    assert.equal(
      template.title({ graphic }),
      "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;"
    );
    assert.deepEqual(details(popupContent(template, graphic)), [
      ["Workstream", pipeline],
      ["Open packages", "1"],
    ]);
  });
});

test("Workstream field label does not rewrite backend names or opaque identifiers", () => {
  return withDocument(() => {
    const template = createPopup().template;
    const attributes = {
      workspaceName: "Pipeline Survey Workspace",
      pipelineName: "Pipeline Survey",
      pipelineId: "Pipeline ID / 42",
    };
    assert.equal(template.title({ graphic: { attributes } }), "Pipeline Survey Workspace");
    assert.deepEqual(details(popupContent(template, { attributes })), [
      ["Workstream", "Pipeline Survey"],
    ]);
    delete attributes.pipelineName;
    assert.deepEqual(details(popupContent(template, { attributes })), [
      ["Workstream", "Pipeline ID / 42"],
    ]);
  });
});

const claimTime = "2026-07-01T08:30:00.1234567+00:00";
const nextClaimTime = "2026-11-27T08:35:00Z";
const esriJSON = JSON.stringify({
  rings: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 0],
    ],
  ],
  spatialReference: { wkid: 4326 },
});

function ownerText(content) {
  return content.children[0].children[1].children[1].textContent;
}

function renderedTime(content) {
  return content.children[1].children[1].children.at(-1).children[1].children[0];
}

test("Claim time uses browser local formatting and retains exact UTC for assistive technology", () =>
  withDocument(() => {
    const popup = createPopup();
    const text = '<img src="x" onerror="alert(1)">' + "x".repeat(300);
    const workspace = normalizeWorkspace({ id: "w", owner: text, lockedAtUtc: claimTime }, "p");
    const graphic = { attributes: { pipelineId: "p", workspaceId: "w" } };
    popup.setWorkspaces([workspace]);
    const content = popupContent(popup.template, graphic);
    const expected = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(claimTime));

    assert.equal(ownerText(content), text);
    assert.equal(content.children[0].children[1].children[1].children.length, 0);
    const time = renderedTime(content);
    assert.equal(time.tagName, "time");
    assert.equal(time.dateTime, claimTime);
    assert.equal(time.title, `UTC: ${claimTime}`);
    assert.equal(time.textContent, expected);
    const utc = content.children[1].children[1].children.at(-1).children[1].children[1];
    assert.equal(utc.textContent, ` local time. UTC: ${claimTime}`);

    popup.setWorkspaces([{ ...workspace, lockedAtUtc: nextClaimTime }]);
    assert.equal(ownerText(content), text);
    assert.equal(renderedTime(content).dateTime, nextClaimTime);
    popup.setWorkspaces([{ ...workspace, lockedAtUtc: null }]);
    assert.deepEqual(details(content).at(-1), ["Claimed at", "Unavailable"]);
  }));

test("SDK content retirement and view disposal stop updates to old popup content", () =>
  withDocument(() => {
    const popup = createPopup();
    const original = normalizeWorkspace({ id: "w", owner: "alice" }, "p");
    const other = normalizeWorkspace({ id: "w", owner: "carol" }, "q");
    const a = { attributes: { pipelineId: "p", workspaceId: "w" } };
    const b = { attributes: { pipelineId: "q", workspaceId: "w" } };
    popup.setWorkspaces([original, other]);
    const beforeClose = popupContent(popup.template, a);
    popup.template.content[0].destroyer({ graphic: a });
    const nextContent = popupContent(popup.template, b);
    popup.setWorkspaces([{ ...original, owner: "bob" }, other]);
    assert.equal(ownerText(beforeClose), "alice");
    assert.equal(ownerText(nextContent), "carol");
    const reopened = popupContent(popup.template, a);
    assert.equal(ownerText(reopened), "bob");

    popup.setWorkspaces([other]);
    assert.equal(ownerText(reopened), "Unavailable");
    popup.destroy();
    popup.setWorkspaces([original, { ...other, owner: "delta" }]);
    assert.equal(ownerText(nextContent), "carol");
    assert.equal(popupContent(popup.template, b), null);
  }));

test("Overview ownership updates the open popup with reused geometry and no additional reads", (t) =>
  withDocument(async () => {
    const calls = [];
    let ownership = { owner: "alice", lockedAtUtc: claimTime };
    const catalogue = createCatalogueService({
      async request(path) {
        calls.push(path);
        if (path === "/v1/pipelines")
          return { page: 1, pageSize: 20, totalCount: 1, items: [{ id: "p" }] };
        if (path === "/v1/pipelines/p/workspaces/overview")
          return {
            page: 1,
            pageSize: 20,
            totalCount: 1,
            items: [{ workspace: { id: "w", ...ownership }, esriJSON, packages: null }],
          };
        assert.fail(`Unexpected request: ${path}`);
      },
    });
    const popup = createPopup();
    const graphic = { attributes: { pipelineId: "p", workspaceId: "w", openJobs: 5 } };
    const prepared = [];
    const cleared = [];
    let overview;
    const overlay = createWorkspaceOverlay({
      source: createWorkspaceGeometrySource({ catalogue, getOverview: () => overview }),
      renderer: {
        setWorkspaceSummaries: popup.setWorkspaces,
        prepare(polygon) {
          prepared.push(polygon);
          return polygon;
        },
        clear() {
          cleared.push(true);
        },
        stop() {},
        replace() {},
        destroy: popup.destroy,
      },
    });
    async function refresh() {
      const snapshot = await loadWorkspaceOverview(catalogue);
      const reuse =
        overlay.getStatus() === "ready" &&
        hasSameWorkspaceOverviewGeometry(overview, snapshot.overview);
      overview = snapshot.overview;
      await overlay.setContext(
        { id: "workspace-catalog", workspaces: snapshot.workspaces },
        { reload: !reuse, autoFocus: false }
      );
    }

    await refresh();
    const open = popupContent(popup.template, graphic);
    assert.equal(ownerText(open), "alice");
    for (const [next, expected] of [
      [{ owner: "alice", lockedAtUtc: nextClaimTime }, "alice"],
      [{ owner: "bob", lockedAtUtc: nextClaimTime }, "bob"],
      [{ owner: null }, "Unassigned"],
      [{}, "Unavailable"],
    ]) {
      ownership = next;
      await refresh();
      assert.equal(ownerText(open), expected);
      if (next.lockedAtUtc) assert.equal(renderedTime(open).dateTime, nextClaimTime);
      else
        assert.equal(
          details(open).some(([label]) => label === "Claimed at"),
          false
        );
    }
    assert.deepEqual(details(open), [
      ["Workstream", "p"],
      ["Open packages", "5"],
    ]);
    popup.template.content[0].destroyer({ graphic });
    assert.equal(ownerText(popupContent(popup.template, graphic)), "Unavailable");
    assert.equal(prepared.length, 1);
    assert.equal(cleared.length, 1);
    assert.deepEqual(
      calls,
      Array.from({ length: 5 }, () => [
        "/v1/pipelines",
        "/v1/pipelines/p/workspaces/overview",
      ]).flat()
    );
    t.diagnostic(
      "Startup plus four Refresh loads: 5 Pipeline GETs, 5 Overview GETs, 0 other requests, 1 geometry preparation"
    );
    overlay.destroy();
  }));

test("A fallback detail polygon cannot replace accepted Overview ownership", () =>
  withDocument(async () => {
    const summary = normalizeWorkspace({ id: "w", owner: "alice", lockedAtUtc: claimTime }, "p");
    const detail = normalizeWorkspace({ id: "w", owner: "detail-owner" }, "p");
    const popup = createPopup();
    let reads = 0;
    const overlay = createWorkspaceOverlay({
      source: createWorkspaceGeometrySource({
        catalogue: {
          async workspace() {
            reads++;
            return { workspace: detail, esriJSON };
          },
        },
        getOverview: () => new Map([[summary.key, { workspace: summary, esriJSON: null }]]),
      }),
      renderer: {
        setWorkspaceSummaries: popup.setWorkspaces,
        prepare: (polygon) => polygon,
        clear() {},
        stop() {},
        replace() {},
        destroy: popup.destroy,
      },
    });
    await overlay.setContext(
      { id: "workspace-catalog", workspaces: [summary] },
      { autoFocus: false }
    );
    assert.equal(overlay.getStatus(), "ready");
    assert.equal(reads, 1);
    const content = popupContent(popup.template, { attributes: summary });
    assert.equal(ownerText(content), "alice");
    assert.equal(renderedTime(content).dateTime, claimTime);
    assert.equal(reads, 1);
    overlay.destroy();
  }));
