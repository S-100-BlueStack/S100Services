import assert from "node:assert/strict";
import test from "node:test";
import { renderInformationFields } from "./renderInformationFields.js";

class TestNode {
  constructor(tagName, text = "") {
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.className = "";
    this.value = text;
  }

  get textContent() {
    return this.tagName === "#TEXT"
      ? this.value
      : this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value) {
    this.replaceChildren();
    if (String(value)) this.append(new TestNode("#text", String(value)));
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) {
        const siblings = node.parentNode.childNodes;
        siblings.splice(siblings.indexOf(node), 1);
      }
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }

  replaceChildren(...nodes) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }
}

function withDocument(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestNode(tagName) };
  try {
    return run(new TestNode("div"));
  } finally {
    globalThis.document = previous;
  }
}

function pairs(container) {
  const list = container.firstChild;
  return Array.from({ length: list.childNodes.length / 2 }, (_, index) => [
    list.childNodes[index * 2],
    list.childNodes[index * 2 + 1],
  ]);
}

test("Live Package details retain ordered definition terms and visible short values", () => {
  withDocument((container) => {
    renderInformationFields(
      container,
      [
        ["Title", "Kattegat"],
        ["Category", "NM"],
        ["Severity", "0"],
        ["Details", "Short description"],
        ["Publication", null],
      ],
      { live: true }
    );

    assert.equal(container.firstChild.tagName, "DL");
    assert.equal(container.firstChild.className, "dc-information-fields");
    const fields = pairs(container);
    assert.deepEqual(
      fields.map(([term, description]) => [term.tagName, term.textContent, description.tagName]),
      [
        ["DT", "Title", "DD"],
        ["DT", "Category", "DD"],
        ["DT", "Severity", "DD"],
        ["DT", "Details", "DD"],
        ["DT", "Publication", "DD"],
      ]
    );
    assert.equal(fields[3][1].textContent, "Short description");
    assert.equal(fields[3][1].firstChild.tagName, "#TEXT");
    assert.equal(fields[4][1].textContent, "Not provided");
  });
});

test("Long live Package descriptions remain fully visible without a disclosure", () => {
  withDocument((container) => {
    const verbose = "Detailed position and publication metadata. ".repeat(24);
    renderInformationFields(container, [["Details", verbose]], { live: true });

    const [[term, description]] = pairs(container);
    assert.equal(term.textContent, "Details");
    assert.equal(description.textContent, verbose);
    assert.equal(description.firstChild.tagName, "#TEXT");
    assert.equal(description.childNodes.length, 1);
  });
});

test("Long live Package details retain ordered neighboring fields without extra controls", () => {
  withDocument((container) => {
    const verbose = "Long Package description. ".repeat(50);
    renderInformationFields(
      container,
      [
        ["Title", "Harbour updates"],
        ["Category", "NM"],
        ["Details", verbose],
        ["Severity", "0"],
      ],
      { live: true }
    );

    const fields = pairs(container);
    assert.deepEqual(
      fields.map(([term, value]) => [term.textContent, value.tagName]),
      [
        ["Title", "DD"],
        ["Category", "DD"],
        ["Details", "DD"],
        ["Severity", "DD"],
      ]
    );
    assert.equal(fields[2][1].textContent, verbose);
    assert.equal(fields[2][1].firstChild.tagName, "#TEXT");
    assert.equal(fields[3][1].textContent, "0");
  });
});

test("Mock Feature details retain the existing flat list and never collapse", () => {
  withDocument((container) => {
    const verbose = "Unchanged mock details. ".repeat(40);
    renderInformationFields(container, [
      ["ID", "feature-1"],
      ["Details", verbose],
    ]);

    assert.equal(container.firstChild.className, "");
    const fields = pairs(container);
    assert.equal(fields[0][0].textContent, "ID");
    assert.equal(fields[1][1].textContent, verbose);
    assert.equal(fields[1][1].firstChild.tagName, "#TEXT");

    renderInformationFields(container, [], { live: true });
    assert.equal(container.childNodes.length, 0);
  });
});
