import assert from "node:assert/strict";
import test from "node:test";
import { isSafeDescriptionUrl, renderPackageDescriptions } from "./renderPackageDescriptions.js";

test("HTML description links allow HTTP and HTTPS but reject executable URLs", () => {
  assert.equal(isSafeDescriptionUrl("https://example.com/document"), true);
  assert.equal(isSafeDescriptionUrl("/about", "https://example.com/"), true);
  assert.equal(isSafeDescriptionUrl("mailto:contact@example.com"), true);
  assert.equal(isSafeDescriptionUrl("javascript:alert(1)"), false);
  assert.equal(isSafeDescriptionUrl("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isSafeDescriptionUrl("vbscript:msgbox(1)"), false);
});

test("A missing Package description language does not manufacture an unspecified label", () => {
  const originalDocument = globalThis.document;
  const makeNode = (tag) => ({
    tagName: tag,
    children: [],
    childNodes: [],
    replaceChildren() {
      this.children = [];
      this.childNodes = [];
    },
    append(...nodes) {
      this.children.push(...nodes);
      this.childNodes.push(...nodes);
    },
    get textContent() {
      return this._textContent ?? "";
    },
    set textContent(value) {
      this._textContent = value;
    },
  });
  globalThis.document = {
    createElement(tag) {
      const node = makeNode(tag);
      if (tag === "template") node.content = { childNodes: [] };
      return node;
    },
    createDocumentFragment: () => makeNode("fragment"),
    createTextNode: (value) => ({ nodeType: 3, textContent: value }),
  };
  try {
    const container = makeNode("div");
    renderPackageDescriptions(container, [
      { language: null, description: "First" },
      { language: "  en  ", description: "Second" },
    ]);
    assert.equal(container.children.length, 2);
    assert.equal(container.children[0].children.length, 1);
    assert.equal(container.children[0].children[0].className, "dc-package-description__body");
    assert.equal(container.children[1].children[0].textContent, "en");
  } finally {
    globalThis.document = originalDocument;
  }
});
