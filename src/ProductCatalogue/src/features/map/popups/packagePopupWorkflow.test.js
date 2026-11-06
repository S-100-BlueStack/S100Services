import assert from "node:assert/strict";
import test from "node:test";
import { updatePackagePopupWorkflow } from "./packagePopupWorkflow.js";

function createElement() {
  return {
    children: [],
    className: "",
    attributes: {},
    classList: {
      contains(name) {
        return this.owner.className === name;
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    },
    get lastElementChild() {
      return this.children.at(-1);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this);
    },
  };
}

function setup() {
  const previousDocument = globalThis.document;
  const document = {
    createElement: () => {
      const element = createElement();
      element.classList.owner = element;
      return element;
    },
  };
  globalThis.document = document;
  const container = document.createElement("div");
  const section = document.createElement("div");
  section.className = "popup-section";
  container.appendChild(section);
  return {
    container,
    section,
    cleanup() {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    },
  };
}

test("empty or idle package workflow never adds the footer", () => {
  const h = setup();
  try {
    updatePackagePopupWorkflow(h.container, {
      summary: {
        workflowText: null,
        unavailableText: null,
        pausedText: null,
        scheduledSendAt: null,
      },
    });
    assert.deepEqual(h.container.children, [h.section]);
    updatePackagePopupWorkflow(h.container, {
      summary: {
        workflowText: "Package workflow: Ready",
        pausedText: null,
      },
    });
    assert.equal(h.container.children.length, 2);
    assert.equal(h.container.children[1].children[0].textContent, "Package workflow: Ready");
    updatePackagePopupWorkflow(h.container, {
      summary: {
        workflowText: null,
        unavailableText: null,
        pausedText: null,
      },
    });
    assert.deepEqual(h.container.children, [h.section]);
  } finally {
    h.cleanup();
  }
});

test("real pause or scheduled delivery still gets its own non-empty workflow section", () => {
  const h = setup();
  try {
    updatePackagePopupWorkflow(h.container, {
      summary: {
        workflowText: null,
        pausedText: "Delivery paused.",
        scheduledSendAt: "2026-10-14T10:00:00Z",
        unavailableText: null,
      },
    });
    assert.deepEqual(
      h.container.children[1].children.map((node) => node.textContent),
      ["Delivery paused.", "Planned send: 2026-10-14T10:00:00Z"]
    );
  } finally {
    h.cleanup();
  }
});
