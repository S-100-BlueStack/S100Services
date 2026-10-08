import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as list from "../domain/reviewProductList.js";
import * as presentation from "./reviewContentPresentation.js";
import { loadReviewHistories } from "../services/reviewHistoryLoader.js";
import { createReviewPackageFixture, packageNames } from "../testSupport/reviewPackageFixture.js";

// Only the external Calcite registration is removed. The production board and
// History state renderers execute against an application-owned DOM contract.
class Element {
  children = [];
  dataset = {};
  attributes = {};
  textContent = "";
  className = "";
  classList = { add: (...names) => { this.className += ` ${names.join(" ")}`; } };
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  hasChildNodes() { return this.children.length > 0; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener() {}
  querySelectorAll(selector) { return byClass(this, selector.slice(1)); }
}
const document = { createElement: () => new Element(), createDocumentFragment: () => new Element() };
const historySource = (await readFile(new URL("../../timeline/ui/productHistoryRenderers.js", import.meta.url), "utf8"))
  .replace(/^import "[^"]+";\s*/gm, "").replace(/export function/g, "function");
const historyRenderers = runInNewContext(`${historySource}\n({createProductHistoryBanner,createProductHistoryStateMessage,formatHistoryTimestamp});`, { document });
const boardSource = (await readFile(new URL("reviewBoard.js", import.meta.url), "utf8"))
  .replace(/^import "[^"]+";\s*/gm, "")
  .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
  .replace("export function createReviewBoard", "function createReviewBoard");
const createBoard = runInNewContext(`${boardSource}\ncreateReviewBoard;`, {
  document, ...list, ...presentation, ...historyRenderers, getStatusName: (status) => `Member status ${status}`,
});
const nodes = (node) => [node, ...node.children.flatMap(nodes)];
const byClass = (root, name) => nodes(root).filter((node) => node.className.split(" ").includes(name));

test("board has one package column with two ordered member sections and one ordinary column", async () => {
  const h = createReviewPackageFixture();
  const products = await loadReviewHistories([...packageNames, "Simple A"], h.options);
  const items = list.createReviewProductItems([packageNames[0], "Simple A"]);
  const board = createBoard({ productItems: items, enabledDatasetNames: items.map((item) => item.datasetName), products });
  const columns = byClass(board, "pc-review-column");
  assert.equal(columns.length, 2);
  const sections = byClass(columns[0], "pc-review-member");
  assert.deepEqual(sections.map((section) => section.dataset.reviewMemberKey), ["s101", "s57"]);
  assert.equal(byClass(columns[1], "pc-review-member").length, 0);
  assert.match(byClass(sections[0], "pc-review-member__meta")[0].textContent, /Member status 8 · Edition: 3 · Update: 2/);
  assert.match(byClass(sections[1], "pc-review-member__meta")[0].textContent, /Member status 11 · Edition: 7 · Update: 4/);
  assert.equal(byClass(columns[0], "pc-review-content-card").length, 6);
  assert.equal(byClass(columns[1], "pc-review-content-card").length, 3);
  for (const section of sections) {
    const headers = byClass(section, "pc-review-member__header");
    assert.equal(headers.length, 1);
    assert.equal(section.children[0], headers[0]);
    assert.deepEqual(headers[0].children, [
      byClass(section, "pc-review-member__title")[0],
      byClass(section, "pc-review-member__meta")[0],
    ]);
    assert.equal(byClass(headers[0], "pc-review-content-card").length, 0);
    assert.ok(byClass(section, "pc-review-content-card__status").some((node) => node.textContent === "Unavailable"));
    assert.ok(byClass(section, "pc-review-content-card__status").some((node) => node.textContent === "0 events"));
  }
  const links = nodes(sections[1]).filter((node) => node.href);
  assert.equal(links.length, 1);
  assert.match(links[0].href, new RegExp(`${encodeURIComponent(packageNames[1])}/artifacts/`));
});

test("outer content and bulk toggles apply identically to both members without child controls", async () => {
  const h = createReviewPackageFixture();
  const products = await loadReviewHistories(packageNames, h.options);
  let items = list.createReviewProductItems([packageNames[0]]);
  items = list.toggleReviewProductContentType(items, items[0].id, "history", false);
  items = list.toggleAllReviewProductContentTypes(items, "ic-enc-reports", false);
  let board = createBoard({ productItems: items, enabledDatasetNames: [packageNames[0]], products });
  assert.equal(byClass(board, "pc-review-column").length, 1);
  assert.equal(byClass(board, "pc-review-content-card").length, 2);
  assert.ok(byClass(board, "pc-review-content-card").every((node) => node.dataset.reviewContentType === "internal-validation-reports"));
  items = list.toggleAllReviewProductContentTypes(items, "internal-validation-reports", false);
  board = createBoard({ productItems: items, enabledDatasetNames: [packageNames[0]], products });
  assert.equal(byClass(board, "pc-review-member").length, 2);
  assert.equal(byClass(board, "pc-review-content-card").length, 0);
  assert.equal(byClass(board, "pc-review-content-card__state").length, 2);
  items = list.toggleReviewProductItem(items, items[0].id, false);
  board = createBoard({ productItems: items, enabledDatasetNames: [], products: [] });
  assert.equal(byClass(board, "pc-review-column").length, 0);
});

test("retained package refresh warning stays outside successful member presentation states", async () => {
  const h = createReviewPackageFixture();
  const [product] = await loadReviewHistories(packageNames, h.options);
  const items = list.createReviewProductItems([packageNames[0]]);
  const board = createBoard({ productItems: items, enabledDatasetNames: [packageNames[0]], products: [{ ...product, refreshError: "Mapping rejected" }] });
  assert.equal(byClass(board, "pc-review-member").length, 2);
  assert.ok(nodes(board).some((node) => node.textContent === "Mapping rejected"));
  assert.equal(byClass(board, "pc-review-content-card").length, 6);
});

test("refreshing package A retains ordinary column DOM, scroll and disclosure state", async () => {
  const h = createReviewPackageFixture();
  const products = await loadReviewHistories([...packageNames, "Simple A"], h.options);
  products[1] = { ...products[1], history: {
    endpointAvailable: true,
    events: [{ type: "status", title: "Stable history event", timestamp: "2026-10-01T12:00:00Z", details: [] }],
  } };
  const items = list.createReviewProductItems([packageNames[0], "Simple A"]);
  const first = createBoard({ productItems: items, enabledDatasetNames: items.map((item) => item.datasetName), products });
  const columns = byClass(first, "pc-review-column");
  const ordinaryContent = byClass(columns[1], "pc-review-column__content")[0];
  const disclosure = byClass(columns[1], "pc-review-history-event")[0];
  ordinaryContent.scrollTop = 87;
  disclosure.open = true;
  h.controls.edition = 4;
  const [refreshed] = await loadReviewHistories([packageNames[0]], h.options);
  const next = createBoard({ productItems: items, enabledDatasetNames: items.map((item) => item.datasetName), products: [refreshed, products[1]], previousBoard: first });
  const nextColumns = byClass(next, "pc-review-column");
  assert.notEqual(nextColumns[0], columns[0]);
  assert.equal(nextColumns[1], columns[1]);
  assert.equal(byClass(nextColumns[1], "pc-review-column__content")[0].scrollTop, 87);
  assert.equal(byClass(nextColumns[1], "pc-review-history-event")[0], disclosure);
  assert.equal(disclosure.open, true);
});
