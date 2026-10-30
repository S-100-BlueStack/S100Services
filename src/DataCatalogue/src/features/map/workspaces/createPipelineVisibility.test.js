import assert from "node:assert/strict";
import test from "node:test";
import { createPipelineVisibility } from "./createPipelineVisibility.js";

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

function fixture() {
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
        total: 2,
        items: [
          { pipelineId: "paper", workspaceId: "west", name: "Western Denmark", key: "paper/west" },
          { pipelineId: "enc", workspaceId: "east", name: "Eastern Denmark", key: "enc/east" },
        ],
      };
    },
  };
  const controller = createPipelineVisibility({
    catalogue,
    container,
    onWorkspacesLoaded(workspaces) {
      loaded.push(workspaces);
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
    const encWorkspaceCheckbox = list.children[0].children[1].children[0];
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
    assert.equal(newList.children[0].children[1].children[0].checked, false);
    assert.equal(newList.children[1].children[1].children[0].checked, true);
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
    const child = group.children[1].children[0];
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
