import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceScope } from "./createWorkspaceScope.js";

class Element extends EventTarget {
  children = [];
  value = "";
  setAttribute() {}
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
    this.value = children[0]?.value ?? "";
  }
  remove() {}
}

function dom(t) {
  const previousDocument = globalThis.document;
  const previousOption = globalThis.Option;
  globalThis.document = { createElement: () => new Element() };
  globalThis.Option = class extends Element {
    constructor(text, value) {
      super();
      this.textContent = text;
      this.value = value;
    }
  };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousOption === undefined) delete globalThis.Option;
    else globalThis.Option = previousOption;
  });
}

test("Workspace selection and deliberate focus notify the map independently of Jobs refresh/status", async (t) => {
  dom(t);
  const workspace = {
    pipelineId: "p",
    workspaceId: "w",
    key: '["p","w"]',
    name: "Area",
    pipelineName: "ENC",
  };
  const selected = [],
    maps = [],
    loads = [],
    focuses = [];
  let resets = 0;
  const scope = createWorkspaceScope({
    catalogue: { workspaces: async () => ({ items: [workspace], page: 0, total: 1 }) },
    adapter: {
      setScope: (value) => selected.push(value),
      resetStatuses: () => {
        resets++;
      },
    },
    store: { loadJobs: async (options) => loads.push(options) },
    onScopeChange: (value, options) => maps.push({ value, options }),
    onFocus: () => focuses.push(true),
  });
  await new Promise(setImmediate);
  const [label, focus, reload, reset] = scope.element.children;
  const select = label.children[0];
  assert.equal(selected.length, 0);
  assert.equal(focus.disabled, true);
  select.value = workspace.key;
  select.dispatchEvent(new Event("change"));
  assert.equal(selected[0], workspace);
  assert.equal(maps[0].value, workspace);
  assert.equal(focus.disabled, false);
  focus.dispatchEvent(new Event("click"));
  assert.equal(focuses.length, 1);
  assert.equal(loads.length, 1);
  reset.dispatchEvent(new Event("click"));
  assert.equal(resets, 1);
  assert.equal(loads.length, 2);
  assert.equal(maps.length, 1);
  reload.dispatchEvent(new Event("click"));
  await new Promise(setImmediate);
  assert.deepEqual(maps[1].options, { reload: true, autoFocus: false });
  select.value = "";
  select.dispatchEvent(new Event("change"));
  assert.equal(maps.at(-1).value, null);
  assert.equal(focus.disabled, true);
  scope.destroy();
});

test("A late Workspace catalogue cannot change scope after teardown", async (t) => {
  dom(t);
  let finish;
  let changes = 0;
  const scope = createWorkspaceScope({
    catalogue: {
      workspaces: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    adapter: {
      setScope: () => {
        changes++;
      },
    },
    store: {
      loadJobs: async () => {
        changes++;
      },
    },
    onScopeChange: () => {
      changes++;
    },
  });
  scope.destroy();
  finish({ items: [], page: 0, total: 0 });
  await new Promise(setImmediate);
  assert.equal(changes, 0);
});
