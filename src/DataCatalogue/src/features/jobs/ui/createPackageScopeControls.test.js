import assert from "node:assert/strict";
import test from "node:test";
import { createPackageScopeControls } from "./createPackageScopeControls.js";

function fakeDocument() {
  const doc = { activeElement: null };
  const documentEvents = new Map();
  doc.addEventListener = (type, listener) => {
    const listeners = documentEvents.get(type) ?? new Set();
    listeners.add(listener);
    documentEvents.set(type, listeners);
  };
  doc.removeEventListener = (type, listener) => documentEvents.get(type)?.delete(listener);
  doc.dispatch = (type, target) => {
    for (const listener of documentEvents.get(type) ?? []) listener({ type, target });
  };
  doc.listenerCount = (type) => documentEvents.get(type)?.size ?? 0;
  class Node {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.events = new Map();
      this.attrs = new Map();
      this.dataset = {};
      this.classList = { toggle() {} };
      this.value = "";
      this.scrollTop = 0;
      this.disabled = false;
      this.checked = false;
    }
    setAttribute(name, value) {
      this.attrs.set(name, value);
    }
    append(...items) {
      this.children.push(...items);
    }
    replaceChildren(...items) {
      this.children = items;
      this.scrollTop = 0;
    }
    addEventListener(name, callback) {
      this.events.set(name, callback);
    }
    contains(target) {
      return this === target || this.children.some((child) => child.contains(target));
    }
    change(checked) {
      this.checked = checked;
      this.focus();
      this.events.get("change")?.({ target: this });
    }
    focus() {
      doc.activeElement = this;
    }
  }
  doc.createElement = (tag) => new Node(tag);
  return doc;
}

const groups = [
  {
    id: "enc",
    name: "ENC",
    workspaces: [
      { pipelineId: "enc", workspaceId: "east", name: "East" },
      { pipelineId: "enc", workspaceId: "west", name: "West" },
    ],
  },
  {
    id: "paper",
    name: "Paper Charts",
    workspaces: [{ pipelineId: "paper", workspaceId: "north", name: "North" }],
  },
];

function inputs(dropdown) {
  return dropdown.children[1].children.map((row) => ({
    label: row.children[1].textContent,
    input: row.children[0],
    count: row.children[2]?.textContent,
  }));
}

function getInput(dropdown, label) {
  const row = inputs(dropdown).find((item) => item.label === label);
  assert.ok(row, `Missing ${label}`);
  return row.input;
}

const contextKey = (pipelineId, workspaceId) => JSON.stringify([pipelineId, workspaceId]);

test("All pipelines is the default and both dropdowns support multi-select", () => {
  const changes = [];
  const doc = fakeDocument();
  const controls = createPackageScopeControls({ doc, onChange: (scope) => changes.push(scope) });
  const [, pipelines, workspaces] = controls.element.children;
  controls.setCatalogue(groups);
  assert.deepEqual(controls.getScope(), {
    pipelineIds: ["enc", "paper"],
    workspaceKeys: null,
    showEmptyWorkspaces: false,
  });
  assert.equal(getInput(pipelines, "All pipelines").checked, true);
  getInput(pipelines, "ENC").change(true);
  assert.deepEqual(controls.getScope().pipelineIds, ["enc"]);
  getInput(pipelines, "Paper Charts").change(true);
  assert.deepEqual(controls.getScope().pipelineIds, ["enc", "paper"]);
  assert.equal(doc.activeElement?.dataset.scopeKey, "Paper Charts");
  getInput(workspaces, "West (ENC)").change(true);
  getInput(workspaces, "North (Paper Charts)").change(true);
  assert.deepEqual(controls.getScope().workspaceKeys, [
    contextKey("enc", "west"),
    contextKey("paper", "north"),
  ]);
  assert.equal(doc.activeElement?.dataset.scopeKey, "North (Paper Charts)");
  getInput(pipelines, "All pipelines").change(true);
  assert.deepEqual(controls.getScope().pipelineIds, ["enc", "paper"]);
  assert.equal(getInput(pipelines, "All pipelines").checked, true);
  getInput(pipelines, "ENC").change(true);
  assert.deepEqual(controls.getScope().pipelineIds, ["enc"]);
  assert.deepEqual(controls.getScope().workspaceKeys, [contextKey("enc", "west")]);
  assert.ok(changes.length >= 4);
  controls.destroy();
});

test("workspace options sort by open Job counts and hide zero-count choices by default", () => {
  const doc = fakeDocument();
  const controls = createPackageScopeControls({ doc });
  controls.setCatalogue(groups);
  controls.setJobs([
    { id: "1", pipelineId: "enc", workspaceId: "west", status: "todo" },
    { id: "2", pipelineId: "enc", workspaceId: "west", status: "todo" },
    { id: "3", pipelineId: "enc", workspaceId: "east", status: "done" },
  ]);
  const [, , workspace] = controls.element.children;
  assert.deepEqual(
    inputs(workspace).map((row) => row.label),
    ["All Workspaces", "West (ENC)"]
  );
  assert.equal(inputs(workspace)[1].count, "2 open");
  const switchElement = controls.element.children[3].children[1];
  assert.equal(switchElement.attrs.get("role"), "switch");
  assert.equal(switchElement.attrs.get("aria-label"), "Show empty Workspaces");
  workspace.open = true;
  switchElement.change(true);
  assert.equal(controls.getScope().showEmptyWorkspaces, true);
  assert.equal(
    workspace.open,
    false,
    "the options are closed rather than resized under the pointer"
  );
  assert.deepEqual(
    inputs(workspace).map((row) => row.label),
    ["All Workspaces", "West (ENC)", "East (ENC)", "North (Paper Charts)"]
  );
  assert.equal(controls.element.children[3].children[1], switchElement);
  switchElement.change(false);
  assert.deepEqual(
    inputs(workspace).map((row) => row.label),
    ["All Workspaces", "West (ENC)"]
  );
  controls.destroy();
});

test("catalogue reload preserves selections and excludes removed Pipeline/Workspace identities", () => {
  const changes = [];
  const controls = createPackageScopeControls({
    doc: fakeDocument(),
    onChange: (scope) => changes.push(scope),
  });
  controls.setCatalogue(groups);
  const [, pipelines, workspaces] = controls.element.children;
  getInput(workspaces, "West (ENC)").change(true);
  controls.setCatalogue(groups);
  assert.deepEqual(controls.getScope().workspaceKeys, [contextKey("enc", "west")]);
  controls.setCatalogue(groups.slice(1));
  assert.deepEqual(controls.getScope(), {
    pipelineIds: ["paper"],
    workspaceKeys: null,
    showEmptyWorkspaces: false,
  });
  controls.setCatalogue([]);
  assert.deepEqual(controls.getScope(), {
    pipelineIds: [],
    workspaceKeys: null,
    showEmptyWorkspaces: false,
  });
  assert.equal(changes.length, 4);
  controls.destroy();
});

test("untrusted Pipeline and Workspace identities fail before publishing a scope", () => {
  const controls = createPackageScopeControls({ doc: fakeDocument() });
  assert.throws(() => controls.setCatalogue([groups[0], groups[0]]), /duplicate identity/);
  assert.throws(
    () =>
      controls.setCatalogue([
        { id: "enc", workspaces: [{ pipelineId: "paper", workspaceId: "east" }] },
      ]),
    /invalid scope/
  );
  controls.destroy();
});

test("a catalogue reload returns focus to the dropdown when its focused Workspace disappears", () => {
  const doc = fakeDocument();
  const controls = createPackageScopeControls({ doc });
  controls.setCatalogue(groups);
  const [, , workspaces] = controls.element.children;
  getInput(workspaces, "West (ENC)").focus();
  controls.setCatalogue(groups.slice(1));
  assert.equal(doc.activeElement, workspaces.children[0], "the stable summary receives focus");
  controls.destroy();
});

test("rebuilding options preserves scroll positions and the external switch", () => {
  const doc = fakeDocument();
  const controls = createPackageScopeControls({ doc });
  const [, pipelines, workspaces, externalToggle] = controls.element.children;
  controls.setCatalogue(groups);
  controls.setJobs([{ id: "open", pipelineId: "enc", workspaceId: "west", status: "todo" }]);
  pipelines.children[1].scrollTop = 140;
  workspaces.children[1].scrollTop = 90;
  const switchElement = externalToggle.children[1];
  getInput(pipelines, "ENC").change(true);
  assert.equal(pipelines.children[1].scrollTop, 140);
  assert.equal(workspaces.children[1].scrollTop, 90);
  assert.equal(externalToggle.children[1], switchElement);
  assert.equal(controls.getScope().showEmptyWorkspaces, false);
  controls.destroy();
});

test("a first empty catalogue does not lock in a missing Pipeline selection", () => {
  const controls = createPackageScopeControls({ doc: fakeDocument() });
  controls.setCatalogue([]);
  assert.deepEqual(controls.getScope().pipelineIds, []);
  controls.setCatalogue(groups);
  assert.deepEqual(controls.getScope().pipelineIds, ["enc", "paper"]);
  assert.equal(getInput(controls.element.children[1], "All pipelines").checked, true);
  controls.destroy();
});

test("All pipelines includes newly discovered Pipelines but an explicit choice stays narrow", () => {
  const controls = createPackageScopeControls({ doc: fakeDocument() });
  controls.setCatalogue(groups);
  const added = { id: "s102", name: "S-102", workspaces: [] };
  controls.setCatalogue([...groups, added]);
  assert.deepEqual(controls.getScope().pipelineIds, ["enc", "paper", "s102"]);
  const pipelines = controls.element.children[1];
  getInput(pipelines, "Paper Charts").change(true);
  assert.deepEqual(controls.getScope().pipelineIds, ["paper"]);
  controls.setCatalogue([...groups, added]);
  assert.deepEqual(controls.getScope().pipelineIds, ["paper"]);
  controls.destroy();
});

test("only one scope dropdown stays open during native click and toggle activation", () => {
  const doc = fakeDocument();
  const controls = createPackageScopeControls({ doc });
  controls.setCatalogue(groups);
  const [, pipelines, workspaces] = controls.element.children;
  const initial = controls.getScope();

  pipelines.open = true;
  pipelines.events.get("toggle")?.();
  assert.equal(pipelines.open, true);
  assert.equal(workspaces.open, false);

  // A summary click precedes the native details open toggle in the browser.
  workspaces.children[0].events.get("click")?.();
  assert.equal(pipelines.open, false);
  workspaces.open = true;
  workspaces.events.get("toggle")?.();
  assert.equal(workspaces.open, true);
  assert.equal(pipelines.open, false);

  pipelines.open = true;
  pipelines.events.get("toggle")?.();
  assert.equal(workspaces.open, false);
  assert.deepEqual(
    controls.getScope(),
    initial,
    "opening menus does not change the selected scope"
  );
  controls.destroy();
});

test("outside pointer and keyboard focus close menus without stealing focus", () => {
  const doc = fakeDocument();
  const controls = createPackageScopeControls({ doc });
  controls.setCatalogue(groups);
  const [, pipelines, workspaces, externalToggle] = controls.element.children;
  assert.equal(doc.listenerCount("pointerdown"), 1);
  assert.equal(doc.listenerCount("focusin"), 1);

  pipelines.open = true;
  doc.dispatch("pointerdown", pipelines.children[1].children[0].children[0]);
  assert.equal(pipelines.open, true, "interacting within the open dropdown must not close it");
  doc.dispatch("pointerdown", workspaces.children[0]);
  assert.equal(pipelines.open, false, "interacting with the sibling closes the first menu");
  workspaces.open = true;
  const emptySwitch = externalToggle.children[1];
  emptySwitch.focus();
  doc.dispatch("pointerdown", emptySwitch);
  assert.equal(workspaces.open, false, "the external switch is outside both dropdowns");
  assert.equal(doc.activeElement, emptySwitch, "outside clicks never redirect focus");

  pipelines.open = true;
  const external = doc.createElement("button");
  external.focus();
  doc.dispatch("focusin", external);
  assert.equal(pipelines.open, false, "tabbing outside dismisses an open dropdown");
  assert.equal(doc.activeElement, external);

  controls.destroy();
  assert.equal(doc.listenerCount("pointerdown"), 0);
  assert.equal(doc.listenerCount("focusin"), 0);
});

test("Escape dismisses a dropdown and returns keyboard focus to its summary", () => {
  const doc = fakeDocument();
  const controls = createPackageScopeControls({ doc });
  controls.setCatalogue(groups);
  const pipelines = controls.element.children[1];
  pipelines.open = true;
  const event = {
    key: "Escape",
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
  pipelines.events.get("keydown")?.(event);
  assert.equal(pipelines.open, false);
  assert.equal(doc.activeElement, pipelines.children[0]);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  controls.destroy();
});
