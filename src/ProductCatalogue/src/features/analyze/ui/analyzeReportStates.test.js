import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.classList = {
      add: (...values) => {
        this.className += ` ${values.join(" ")}`;
      },
    };
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
  setAttribute() {}
}
const document = { createElement: (name) => new Element(name) };
const src = (await readFile(new URL("./analyzeSidebar.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
  .replace(/^import "[^"]+";\s*/gm, "")
  .replace(/export function/g, "function");
const historyState = ({ title, message }) => {
  const element = new Element("div");
  const heading = new Element("h3");
  heading.textContent = title;
  const body = new Element("p");
  body.textContent = message;
  element.className = "pc-product-history-state";
  element.append(heading, body);
  return element;
};
const renderers = runInNewContext(
  `${src}\n({ createXmlBlock, createInternalValidationReportsBlock, createHistoryBlock });`,
  { document, createProductHistoryStateMessage: historyState }
);
const nodes = (el) => [el, ...el.children.flatMap(nodes)];
const hasClass = (el, klass) => el.className.split(" ").includes(klass);
const states = (root) => nodes(root).filter((element) => hasClass(element, "analyze-report-state"));
const titles = (root) =>
  states(root).flatMap((state) =>
    state.children.filter((x) => x.tagName === "h3").map((x) => x.textContent)
  );

test("History, IC-ENC and Validation keep neutral collapsed labels and a shared empty layout", () => {
  const history = renderers.createHistoryBlock({
    datasetName: "101DK001A",
    history: { endpointAvailable: true, events: [] },
  });
  const icEnc = renderers.createXmlBlock(null, { implemented: true });
  const validation = renderers.createInternalValidationReportsBlock([], { implemented: true });
  assert.equal(history.children[0].textContent, "History");
  assert.equal(icEnc.children[0].textContent, "IC-ENC");
  assert.equal(validation.children[0].textContent, "Internal validation");
  assert.deepEqual(titles(history), ["No historical changes found"]);
  assert.deepEqual(titles(icEnc), ["No IC-ENC reports found"]);
  assert.deepEqual(titles(validation), ["No validation reports found"]);
  assert.equal(states(history).length, 1);
  assert.equal(states(icEnc).length, 1);
  assert.equal(states(validation).length, 1);
});

test("unsupported availability and real History failures retain truthful explanations", () => {
  const unsupportedXml = renderers.createXmlBlock(null, {
    implemented: false,
    availabilityReason: "IC-ENC unavailable for this source",
  });
  const unsupportedValidation = renderers.createInternalValidationReportsBlock([], {
    implemented: false,
    availabilityReason: "Validation unavailable for this source",
  });
  const failedHistory = renderers.createHistoryBlock({
    datasetName: "101DK001A",
    historyError: "HTTP 503",
  });
  assert.deepEqual(titles(unsupportedXml), ["No IC-ENC reports found"]);
  assert.deepEqual(titles(unsupportedValidation), ["Internal validation not available"]);
  assert.deepEqual(titles(failedHistory), ["History could not be loaded"]);
  assert.ok(nodes(failedHistory).some((item) => item.textContent === "HTTP 503"));
  assert.ok(
    nodes(unsupportedXml).some(
      (item) => item.textContent === "No IC-ENC reports were returned for this product."
    )
  );
});
