import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

// Exercise the actual production report renderer using an application-owned DOM model.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.attributes = {};
    this.classList = {
      add: (...names) => {
        this.className += ` ${names.join(" ")}`;
      },
    };
  }
  append(...children) {
    this.children.push(...children);
  }
  appendChild(child) {
    this.append(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

const document = { createElement: (tagName) => new Element(tagName) };
const source = (await readFile(new URL("./analyzeSidebar.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
  .replace(/export function/g, "function");
const createReports = runInNewContext(`${source}\ncreateInternalValidationReportsBlock;`, {
  document,
});
const descendants = (root) => [root, ...root.children.flatMap(descendants)];
const byClass = (root, name) =>
  descendants(root).filter((node) => node.className.split(" ").includes(name));
const makeReports = (count) =>
  Array.from({ length: count }, (_, index) => ({
    title: `Report ${index + 1}`,
    status: "available",
    url: `https://example.test/validation-${index}.xml`,
  }));

for (const count of [1, 2, 5, 6, 20]) {
  test(`Analyze internal validation exposes all ${count} reports with appropriate overflow`, () => {
    const card = createReports(makeReports(count));
    const list = byClass(card, "analyze-internal-validation__content")[0];
    const bounded = count > 1;
    const reportCards = byClass(list, "analyze-internal-validation__report");
    const links = descendants(list).filter((node) => node.tagName === "calcite-link");

    assert.equal(card.open, true);
    assert.equal(reportCards.length, count);
    assert.equal(
      byClass(list, "analyze-internal-validation__content--scrollable").length,
      Number(bounded)
    );
    assert.equal(byClass(list, "pc-scrollbar").length, Number(bounded));
    assert.equal(list.tabIndex, bounded ? 0 : undefined);
    assert.equal(list.attributes.role, bounded ? "region" : undefined);
    assert.equal(list.attributes["aria-label"], undefined);
    assert.equal(
      list.attributes["aria-labelledby"],
      bounded ? card.children[0].id : undefined
    );
    assert.ok(!bounded || Boolean(card.children[0].id));
    assert.ok(reportCards.every((report) => report.open === true));
    assert.deepEqual(
      links.map((link) => link.href),
      makeReports(count).map((report) => report.url)
    );
    // Full report content is visible by default even when the list is scrollable.
    assert.ok(reportCards.every((report) => report.open));
    assert.ok(links.every((link) => link.download.startsWith("Report ")));
  });
}

test("Analyze empty validation state is not an interactive nested scroll area", () => {
  const card = createReports([], { implemented: false, availabilityReason: "Unsupported" });
  const list = byClass(card, "analyze-internal-validation__content")[0];
  assert.equal(card.open, false);
  assert.equal(list.attributes.role, undefined);
  assert.equal(list.attributes["aria-labelledby"], undefined);
  assert.equal(list.tabIndex, undefined);
  assert.equal(byClass(list, "analyze-internal-validation__content--scrollable").length, 0);
  assert.equal(
    byClass(card, "analyze-internal-validation__state-title")[0].textContent,
    "Internal validation not available"
  );
});

test("Analyze report viewport accommodates roughly two expanded reports and scrolls", async () => {
  const css = await readFile(new URL("../../../styles/analyze.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.analyze-internal-validation__content--scrollable\s*\{[^}]*max-height: clamp\(/s
  );
  assert.match(
    css,
    /\.analyze-internal-validation__content--scrollable\s*\{[^}]*overflow-y: auto;/s
  );
  assert.match(css, /max-height: clamp\(25rem, 62dvh, 34rem\);/);
});

test("Analyze retains expanded inline report content and distinct accessible scroll labels", () => {
  const first = createReports([
    { title: "Validation A", content: "<report>ok</report>", format: "xml" },
    { title: "Validation B", summary: "Second result" },
  ]);
  const second = createReports(makeReports(2));
  const firstList = byClass(first, "analyze-internal-validation__content")[0];
  const secondList = byClass(second, "analyze-internal-validation__content")[0];

  assert.ok(byClass(firstList, "analyze-internal-validation__report").every((report) => report.open));
  assert.equal(byClass(firstList, "analyze-internal-validation__report-content").length, 2);
  assert.ok(descendants(firstList).some((element) => element.tagName === "pre"));
  assert.notEqual(firstList.attributes["aria-labelledby"], secondList.attributes["aria-labelledby"]);
  assert.equal(firstList.attributes["aria-label"], undefined);
  assert.equal(secondList.attributes["aria-label"], undefined);
});
