import assert from "node:assert/strict";
import test from "node:test";
import {
  bindDirectSelectionShortcutHint,
  DIRECT_SELECTION_SHORTCUT_TEXT,
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
  assert.match(element.textContent, /Ctrl\/Cmd-click/);
  assert.match(element.textContent, /Ctrl\/Cmd\+Enter/);
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
