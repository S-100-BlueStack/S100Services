import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

class TestElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = "";
    this.attributes = {};
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = [...classes].join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  get childElementCount() {
    return this.children.length;
  }
  appendChild(child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
  insertBefore(child, next) {
    if (child.parent)
      child.parent.children = child.parent.children.filter((item) => item !== child);
    const index = this.children.indexOf(next);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    child.parent = this;
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this);
  }
  querySelector() {
    return null;
  }
  querySelectorAll(selector) {
    const matches = (node) =>
      selector === ".popup-action-bar__action" &&
      node.classList.contains("popup-action-bar__action");
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

test("Analyze can reconcile its three workflow actions in the shared popup row without Tools", async (t) => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: (name) => new TestElement(name) };
  t.after(() => {
    globalThis.document = originalDocument;
  });
  const updates = [];
  const namespace = `__providedPopupActions${Math.random().toString(36).slice(2)}`;
  globalThis[namespace] = {
    resolveProductContext: () => null,
    createPopupActionGroups: () => {
      throw new Error("Main Map action groups must not be generated");
    },
    createActionButton: (config) => {
      const button = new TestElement("button");
      button.dataset.popupActionId = config.id;
      button.classList.add("popup-action-bar__action");
      button.config = config;
      return button;
    },
    updateActionButton: (button, config) => {
      button.config = config;
      updates.push(button);
      return true;
    },
    disposeActionButton: (button) => {
      button.disposed = true;
    },
    closePopupActionDropdown: () => {},
  };
  const source = await readFile(new URL("./popupActionBar.js", import.meta.url), "utf8");
  const isolated = source.replace(
    /import\s+([\s\S]*?)\s+from\s+"[^"]+";/g,
    (_, bindings) => `const ${bindings} = globalThis[${JSON.stringify(namespace)}];`
  );
  try {
    const { createPopupActionBar, updatePopupActionBar } = await import(
      `data:text/javascript;base64,${Buffer.from(isolated).toString("base64")}`
    );
    const actions = ["pause", "discard", "send"].map((operation) => ({ id: operation, operation }));
    const bar = createPopupActionBar({ providedActions: actions });
    assert.equal(bar.children.length, 1);
    const row = bar.children[0];
    assert.deepEqual(
      row.children.map((button) => button.dataset.popupActionId),
      ["pause", "discard", "send"]
    );
    const originalPause = row.children[0];
    assert.equal(
      updatePopupActionBar(bar, {
        providedActions: [{ id: "pause", operation: "resume" }, ...actions.slice(1)],
      }).supported,
      true
    );
    assert.equal(row.children[0], originalPause);
    assert.equal(originalPause.config.operation, "resume");
    assert.equal(updates.includes(originalPause), true);
    updatePopupActionBar(bar, { providedActions: [] });
    assert.equal(originalPause.disposed, true);
    assert.equal(bar.children.length, 0);
  } finally {
    delete globalThis[namespace];
  }
});
