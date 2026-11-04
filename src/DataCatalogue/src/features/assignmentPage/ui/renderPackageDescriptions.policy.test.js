import assert from "node:assert/strict";
import test from "node:test";
import { appendSanitizedHtml, isSafeDescriptionUrl } from "./renderPackageDescriptions.js";

class TestNode {
  constructor(tagName, { nodeType = 1, textContent = "", attributes = {} } = {}) {
    this.tagName = tagName?.toUpperCase();
    this.nodeType = nodeType;
    this.textContent = textContent;
    this.childNodes = [];
    this.attributes = new Map(Object.entries(attributes));
  }

  append(...children) {
    this.childNodes.push(...children);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  set className(value) {
    this.setAttribute("class", value);
  }
}

function element(tagName, attributes = {}, children = []) {
  const result = new TestNode(tagName, { attributes });
  result.append(...children);
  return result;
}

function text(value) {
  return new TestNode(null, { nodeType: 3, textContent: value });
}

function documentWithParsedNodes(parsedNodes) {
  // The fixture models the inert template's parsed nodes; browser HTML parsing is a separate gate.
  return {
    baseURI: "https://example.org/",
    createElement(name) {
      if (name === "template") {
        return {
          content: { childNodes: parsedNodes },
          set innerHTML(_source) {},
        };
      }
      return element(name);
    },
    createTextNode: (value) => text(value),
    createDocumentFragment: () => new TestNode(null, { nodeType: 11 }),
  };
}

function copiedNodes(parsedNodes) {
  const target = element("section");
  appendSanitizedHtml(target, "HTML supplied by backend", documentWithParsedNodes(parsedNodes));
  return target.childNodes[0].childNodes;
}

test("sanitizer copies safe formatting but drops executable subtrees and arbitrary attributes", () => {
  const source = element("div", { onclick: "execute()" }, [
    element("strong", {}, [text("Visible description")]),
    element("script", {}, [text("Script content")]),
    element("svg", {}, [text("SVG content")]),
    element("form", {}, [text("Form content")]),
    element("span", { style: "position:absolute", onmouseover: "execute()" }, [text("Safe")]),
  ]);
  const [result] = copiedNodes([source]);
  assert.equal(result.tagName, "DIV");
  assert.equal(result.getAttribute("onclick"), null);
  assert.deepEqual(
    result.childNodes.map((node) => node.tagName),
    ["STRONG", "SPAN"]
  );
  assert.equal(result.childNodes[0].childNodes[0].textContent, "Visible description");
  assert.equal(result.childNodes[1].getAttribute("style"), null);
  assert.equal(result.childNodes[1].getAttribute("onmouseover"), null);
});

test("sanitizer preserves safe table attributes and protects copied links", () => {
  const source = element("div", {}, [
    element("table", { class: "position-table arbitrary" }, [
      element("tr", {}, [
        element("td", { class: "pos-col unwanted", colspan: "3", rowspan: "999" }, [
          text("Coordinates"),
        ]),
      ]),
    ]),
    element("a", { href: "https://example.org/report", onclick: "execute()" }, [text("Report")]),
    element("a", { href: "javascript:alert(1)" }, [text("Unsafe link")]),
  ]);
  const [result] = copiedNodes([source]);
  const table = result.childNodes[0];
  const cell = table.childNodes[0].childNodes[0];
  assert.equal(table.getAttribute("class"), "position-table");
  assert.equal(cell.getAttribute("class"), "pos-col");
  assert.equal(cell.getAttribute("colspan"), "3");
  assert.equal(cell.getAttribute("rowspan"), null);
  const safeLink = result.childNodes[1];
  assert.equal(safeLink.getAttribute("href"), "https://example.org/report");
  assert.equal(safeLink.getAttribute("rel"), "noopener noreferrer");
  assert.equal(safeLink.getAttribute("target"), "_blank");
  assert.equal(safeLink.getAttribute("onclick"), null);
  const unsafeLink = result.childNodes[2];
  assert.equal(unsafeLink.getAttribute("href"), null);
  assert.equal(unsafeLink.childNodes[0].textContent, "Unsafe link");
});

test("URL policy rejects executable and non-web schemes, including whitespace-obfuscated scripts", () => {
  assert.equal(isSafeDescriptionUrl("mailto:hello@example.org"), true);
  assert.equal(isSafeDescriptionUrl("/relative-report", "https://example.org/"), true);
  assert.equal(isSafeDescriptionUrl("ftp://example.org/file"), false);
  assert.equal(isSafeDescriptionUrl("java\tscript:alert(1)"), false);
  assert.equal(isSafeDescriptionUrl("DATA:text/html,unsafe"), false);
});
