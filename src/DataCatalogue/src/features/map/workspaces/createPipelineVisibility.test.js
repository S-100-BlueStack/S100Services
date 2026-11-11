import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPipelineVisibility } from "./createPipelineVisibility.js";
import { createLiveJobServiceAdapter } from "../../jobs/services/liveJobServiceAdapter.js";

class TestElement extends EventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.checked = false;
    this.disabled = false;
    this.style = {};
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
}

const defaultWorkspaces = [
  { pipelineId: "paper", workspaceId: "west", name: "Western Denmark", key: "paper/west" },
  { pipelineId: "enc", workspaceId: "east", name: "Eastern Denmark", key: "enc/east" },
];

// The API normalizer supplies stable composite keys; collectPages rejects missing or duplicate keys.
function createPaperWorkspaces(count, displayName = (number) => `Workspace ${number}`) {
  return Array.from({ length: count }, (_, index) => {
    const workspaceId = `workspace-${index + 1}`;
    return {
      pipelineId: "paper",
      workspaceId,
      key: JSON.stringify(["paper", workspaceId]),
      name: displayName(index + 1),
    };
  });
}

function fixture({ onWorkspacesLoaded = null, workspaces = null } = {}) {
  const original = globalThis.document;
  globalThis.document = {
    createElement: (name) => new TestElement(name),
    createTextNode: (value) => ({ textContent: value }),
  };
  const container = new TestElement("div");
  const callbacks = [];
  const loaded = [];
  const catalogue = {
    async pipelines() {
      return [
        { id: "paper", name: "Paper Charts" },
        { id: "enc", name: "ENC" },
      ];
    },
    async workspaces({ page }) {
      if (page !== 0) throw new Error("Only one page expected.");
      return {
        page,
        pageSize: 200,
        total: (workspaces ?? defaultWorkspaces).length,
        items: workspaces ?? defaultWorkspaces,
      };
    },
  };
  const controller = createPipelineVisibility({
    catalogue,
    container,
    onWorkspacesLoaded(workspaces) {
      loaded.push(workspaces);
      onWorkspacesLoaded?.(workspaces);
    },
    onChange(workspaces, options) {
      callbacks.push({ workspaces, options });
    },
  });
  return {
    controller,
    container,
    callbacks,
    loaded,
    catalogue,
    restore() {
      controller.destroy();
      globalThis.document = original;
    },
  };
}

test("Every Pipeline starts enabled and visibility toggles do not reload Jobs", async () => {
  const f = fixture();
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(f.callbacks.length > 0, f.container.children[0].textContent);
    assert.deepEqual(
      f.loaded[0].map((w) => w.pipelineId),
      ["enc", "paper"]
    );
    assert.deepEqual(
      f.callbacks[0].workspaces.map((w) => w.pipelineId),
      ["enc", "paper"]
    );
    assert.equal(f.callbacks[0].options.autoFocus, false);

    const list = f.container.children[1];
    const encCheckbox = list.children[0].children[0].children[0];
    assert.equal(encCheckbox.checked, true);
    encCheckbox.checked = false;
    encCheckbox.dispatchEvent(new Event("change"));

    assert.deepEqual(
      f.callbacks.at(-1).workspaces.map((w) => w.pipelineId),
      ["paper"]
    );
    assert.equal(f.loaded.length, 1, "Map visibility must not change Job membership");
    assert.equal(f.callbacks.at(-1).options.autoFocus, false);
  } finally {
    f.restore();
  }
});

test("Reload preserves disabled Pipelines and updates the complete Jobs scope once", async () => {
  const f = fixture();
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(f.callbacks.length > 0, f.container.children[0].textContent);
    const list = f.container.children[1];
    const encCheckbox = list.children[0].children[0].children[0];
    encCheckbox.checked = false;
    encCheckbox.dispatchEvent(new Event("change"));
    await f.controller.reload();
    assert.equal(f.loaded.length, 2);
    assert.deepEqual(
      f.loaded[1].map((w) => w.pipelineId),
      ["enc", "paper"]
    );
    assert.deepEqual(
      f.callbacks.at(-1).workspaces.map((w) => w.pipelineId),
      ["paper"]
    );
  } finally {
    f.restore();
  }
});

test("Disabling one Workspace does not disable siblings or change Jobs membership", async () => {
  const f = fixture();
  try {
    await new Promise((resolve) => setImmediate(resolve));
    const list = f.container.children[1];
    const encWorkspaceCheckbox = list.children[0].children[1].children[0].children[0];
    assert.equal(encWorkspaceCheckbox.checked, true);
    encWorkspaceCheckbox.checked = false;
    encWorkspaceCheckbox.dispatchEvent(new Event("change"));
    assert.deepEqual(
      f.callbacks.at(-1).workspaces.map((w) => w.pipelineId),
      ["paper"]
    );
    assert.equal(f.loaded.length, 1, "Visibility cannot change actual Workspace membership");
    await f.controller.reload();
    const newList = f.container.children[1];
    assert.equal(newList.children[0].children[1].children[0].children[0].checked, false);
    assert.equal(newList.children[1].children[1].children[0].children[0].checked, true);
  } finally {
    f.restore();
  }
});

test("Pipeline hide and restore retains individual Workspace choices", async () => {
  const f = fixture();
  try {
    await new Promise((resolve) => setImmediate(resolve));
    const group = f.container.children[1].children[0];
    const checkbox = group.children[0].children[0];
    const child = group.children[1].children[0].children[0];
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    assert.equal(child.disabled, true);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    assert.equal(child.disabled, false);
    assert.equal(child.checked, true);
    assert.deepEqual(
      f.callbacks.at(-1).workspaces.map((w) => w.pipelineId),
      ["enc", "paper"]
    );
  } finally {
    f.restore();
  }
});

test("Pipeline and Workspace map toggles do not narrow the live Jobs catalogue", async () => {
  const requests = [];
  const membership = {
    async workspacePackages(pipelineId, workspaceId) {
      requests.push(`${pipelineId}/${workspaceId}`);
      return {
        items: [{ packageId: `package-${pipelineId}-${workspaceId}` }],
        page: 0,
        pageSize: 200,
        total: 1,
      };
    },
    async package(id) {
      return { id, title: id, severity: "1" };
    },
  };
  const adapter = createLiveJobServiceAdapter({ catalogue: membership });
  const f = fixture({ onWorkspacesLoaded: (all) => adapter.setWorkspaces(all) });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
      (await adapter.loadJobs()).jobs.map((job) => job.pipelineId),
      ["enc", "paper"]
    );

    const list = f.container.children[1];
    const encCheckbox = list.children[0].children[0].children[0];
    encCheckbox.checked = false;
    encCheckbox.dispatchEvent(new Event("change"));
    assert.deepEqual(
      f.callbacks.at(-1).workspaces.map((workspace) => workspace.pipelineId),
      ["paper"]
    );

    const paperWorkspaceCheckbox = list.children[1].children[1].children[0].children[0];
    paperWorkspaceCheckbox.checked = false;
    paperWorkspaceCheckbox.dispatchEvent(new Event("change"));
    assert.deepEqual(f.callbacks.at(-1).workspaces, []);
    assert.equal(f.loaded.length, 1, "Visibility toggles cannot replace the Jobs scope");
    assert.deepEqual(
      (await adapter.loadJobs()).jobs.map((job) => job.pipelineId),
      ["enc", "paper"]
    );
    assert.deepEqual(requests, ["enc/east", "paper/west", "enc/east", "paper/west"]);
  } finally {
    f.restore();
  }
});

test("Pipeline groups separate headers from Workspace rows without adding short-list tab stops", async () => {
  const f = fixture();
  try {
    await new Promise((resolve) => setImmediate(resolve));
    const groups = f.container.children[1].children;
    assert.equal(groups.length, 2);
    for (const group of groups) {
      assert.equal(group.attributes.get("role"), "group");
      assert.match(group.attributes.get("aria-label"), / Pipeline$/);
      assert.equal(group.children[0].className, "dc-pipeline-row dc-pipeline-row--pipeline");
      const workspaceList = group.children[1];
      assert.equal(workspaceList.className, "dc-pipeline-workspaces");
      assert.equal(workspaceList.attributes.get("role"), "group");
      assert.match(workspaceList.attributes.get("aria-label"), / Workspaces$/);
      assert.equal(workspaceList.tabIndex, undefined);
      assert.equal(workspaceList.children.length, 1);
    }
  } finally {
    f.restore();
  }
});

test("Workspace group focus is limited to lists longer than six entries", async () => {
  for (const size of [0, 6, 7]) {
    const workspaces = createPaperWorkspaces(size);
    const f = fixture({ workspaces });
    try {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.loaded.length, 1, f.container.children[0].textContent);
      const region = f.container.children[1].children[1].children[1];
      assert.equal(region.children.length, size);
      assert.equal(region.tabIndex, size > 6 ? 0 : undefined);
    } finally {
      f.restore();
    }
  }
});

test("Long Pipeline groups remain fully selectable with one keyboard scroll region", async () => {
  const workspaces = createPaperWorkspaces(
    18,
    (number) => `Paper Workspace ${String(number).padStart(2, "0")}`
  );
  const f = fixture({ workspaces });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.loaded.length, 1, f.container.children[0].textContent);
    const groups = f.container.children[1].children;
    const paper = groups[1];
    const workspacesRegion = paper.children[1];
    assert.equal(paper.children[0].children[2].textContent, "18");
    assert.equal(workspacesRegion.children.length, 18);
    assert.equal(workspacesRegion.tabIndex, 0);
    assert.equal(workspacesRegion.attributes.get("aria-label"), "Paper Charts Workspaces");
    assert.equal(f.loaded.length, 1);

    const last = workspacesRegion.children.at(-1).children[0];
    assert.equal(last.checked, true);
    last.checked = false;
    last.dispatchEvent(new Event("change"));
    assert.equal(f.callbacks.at(-1).workspaces.length, 17);
    assert.equal(f.loaded.length, 1, "Visibility changes must not reload Package membership");
    assert.equal(f.container.children[1].children[1].children[1], workspacesRegion);

    const pipeline = paper.children[0].children[0];
    pipeline.checked = false;
    pipeline.dispatchEvent(new Event("change"));
    assert.ok(workspacesRegion.children.every((row) => row.children[0].disabled));
    pipeline.checked = true;
    pipeline.dispatchEvent(new Event("change"));
    assert.ok(workspacesRegion.children.every((row) => !row.children[0].disabled));
    assert.equal(last.checked, false, "A Pipeline toggle must preserve Workspace choices");
    await f.controller.reload();
    const freshRegion = f.container.children[1].children[1].children[1];
    assert.equal(freshRegion.children.at(-1).children[0].checked, false);
    assert.equal(freshRegion.tabIndex, 0);
  } finally {
    f.restore();
  }
});

test("Pipeline Workspace scrolling and focus use theme-aware panel styles", () => {
  const css = readFileSync(new URL("../../../styles/map.css", import.meta.url), "utf8");
  const pipeline = css.match(/\.dc-pipeline-row--pipeline\s*\{([^}]*)\}/)?.[1];
  const region = css.match(/\.dc-pipeline-workspaces\s*\{([^}]*)\}/)?.[1];
  assert.ok(pipeline && region);
  assert.match(pipeline, /background:\s*var\(--dc-surface-alt\)/);
  assert.match(region, /max-height:\s*12\.25rem/);
  assert.match(region, /overflow-y:\s*auto/);
  assert.match(css, /\.dc-pipeline-workspaces:focus-visible/);
  assert.match(css, /\.dc-pipeline-row:has\(input:focus-visible\)/);
  assert.doesNotMatch(css, /\.dc-pipeline-row:focus-within/);
});
