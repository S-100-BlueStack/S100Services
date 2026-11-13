import assert from "node:assert/strict";
import test from "node:test";
import {
  bindDirectSelectionShortcutHint,
  DIRECT_SELECTION_SHORTCUT_TEXT,
  getDirectSelectionShortcutText,
} from "./directSelectionShortcutHint.js";

test("shortcut hint is contextual, visible, and exposes pointer plus keyboard guidance", () => {
  const attributes = new Map();
  const element = {
    className: "",
    textContent: "",
    title: "",
    hidden: false,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };
  const documentRef = {
    createElement(tagName) {
      assert.equal(tagName, "div");
      return element;
    },
  };
  let subscriber = null;
  let unsubscribed = false;
  const hoverManager = {
    subscribeHighlightedGraphicIdentity(listener) {
      subscriber = listener;
      listener(null);
      return () => {
        unsubscribed = true;
      };
    },
  };
  const uiCalls = [];
  const view = {
    ui: {
      add(node, position) {
        uiCalls.push({ type: "add", node, position });
      },
      remove(node) {
        uiCalls.push({ type: "remove", node });
      },
    },
  };

  const cleanup = bindDirectSelectionShortcutHint(view, { hoverManager, documentRef });

  assert.equal(uiCalls[0].type, "add");
  assert.equal(uiCalls[0].position, "bottom-left");
  assert.equal(element.hidden, true);
  assert.equal(element.textContent, DIRECT_SELECTION_SHORTCUT_TEXT);
  assert.match(element.textContent, /Ctrl-click/);
  assert.match(element.textContent, /Ctrl\+Enter/);
  assert.equal(element.title, DIRECT_SELECTION_SHORTCUT_TEXT);
  assert.equal(attributes.get("role"), "note");
  assert.equal(attributes.get("aria-label"), DIRECT_SELECTION_SHORTCUT_TEXT);

  subscriber('product:["s57","P001"]');
  assert.equal(element.hidden, false);

  subscriber(null);
  assert.equal(element.hidden, true);

  cleanup();
  assert.equal(unsubscribed, true);
  assert.equal(uiCalls.at(-1).type, "remove");
  assert.equal(uiCalls.at(-1).node, element);
});

test("shortcut hints show only the platform-appropriate modifier", () => {
  assert.equal(
    getDirectSelectionShortcutText("Windows"),
    "Ctrl-click or Ctrl+Enter to open highlighted Product"
  );
  assert.equal(
    getDirectSelectionShortcutText("macOS"),
    "Cmd-click or Cmd+Enter to open highlighted Product"
  );
  const attributes = new Map();
  const element = {
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };
  const view = { ui: { add() {}, remove() {} } };
  const cleanup = bindDirectSelectionShortcutHint(view, {
    platform: "MacIntel",
    documentRef: { createElement: () => element },
    hoverManager: { subscribeHighlightedGraphicIdentity: () => () => {} },
  });
  assert.match(element.textContent, /^Cmd-click/);
  assert.equal(element.title, element.textContent);
  assert.equal(attributes.get("aria-label"), element.textContent);
  cleanup();
});
