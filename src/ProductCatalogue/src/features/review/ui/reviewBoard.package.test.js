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
  classList = {
    add: (...names) => {
      this.className += ` ${names.join(" ")}`;
    },
  };
  append(...children) {
    this.children.push(...children);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  hasChildNodes() {
    return this.children.length > 0;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  addEventListener() {}
  querySelectorAll(selector) {
    return byClass(this, selector.slice(1));
  }
}
const document = {
  createElement: () => new Element(),
  createDocumentFragment: () => new Element(),
};
const historySource = (
  await readFile(new URL("../../timeline/ui/productHistoryRenderers.js", import.meta.url), "utf8")
)
  .replace(/^import "[^"]+";\s*/gm, "")
  .replace(/export function/g, "function");
const historyRenderers = runInNewContext(
  `${historySource}\n({createProductHistoryBanner,createProductHistoryStateMessage,formatHistoryTimestamp});`,
  { document }
);
const boardSource = (await readFile(new URL("reviewBoard.js", import.meta.url), "utf8"))
  .replace(/^import "[^"]+";\s*/gm, "")
  .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
  .replace("export function createReviewBoard", "function createReviewBoard");
const boardExports = runInNewContext(
  `${boardSource}\n({createReviewBoard,createCompactHistoryItem,getVisibleEventDetails});`,
  {
    document,
    ...list,
    ...presentation,
    ...historyRenderers,
    getStatusName: (status) => `Member status ${status}`,
    getStatusIdByName: (name) =>
      ({
        Error: 15,
        "Ready For Distribution": 11,
        Idle: 1,
      })[name] ?? null,
    applyProductStatusTone: (element, status) => {
      if (status !== null && status !== undefined) element.classList.add("pc-status-chip--colored");
    },
  }
);
const {
  createReviewBoard: createBoard,
  createCompactHistoryItem,
  getVisibleEventDetails,
} = boardExports;
const nodes = (node) => [node, ...node.children.flatMap(nodes)];
const byClass = (root, name) =>
  nodes(root).filter((node) => node.className.split(" ").includes(name));

test("board has one package column with two ordered member sections and one ordinary column", async () => {
  const h = createReviewPackageFixture();
  const products = await loadReviewHistories([...packageNames, "Simple A"], h.options);
  const items = list.createReviewProductItems([packageNames[0], "Simple A"]);
  const board = createBoard({
    productItems: items,
    enabledDatasetNames: items.map((item) => item.datasetName),
    products,
  });
  const columns = byClass(board, "pc-review-column");
  assert.equal(columns.length, 2);
  const sections = byClass(columns[0], "pc-review-member");
  assert.deepEqual(
    sections.map((section) => section.dataset.reviewMemberKey),
    ["s101", "s57"]
  );
  assert.equal(byClass(columns[1], "pc-review-member").length, 0);
  assert.deepEqual(
    byClass(sections[0], "pc-review-member__status").map((node) => node.textContent),
    ["Member status 8"]
  );
  assert.deepEqual(
    byClass(sections[1], "pc-review-member__edition").map((node) => node.textContent),
    ["Edition 7"]
  );
  assert.equal(
    byClass(sections[0], "pc-review-member__dataset-name")[0].textContent,
    packageNames[0]
  );
  assert.equal(
    byClass(sections[1], "pc-review-member__dataset-name")[0].textContent,
    packageNames[1]
  );
  assert.ok(
    byClass(sections[0], "pc-review-member__status")[0].className.includes(
      "pc-status-chip--colored"
    )
  );
  assert.equal(byClass(sections[0], "pc-review-member__meta")[0].children.length, 2);
  assert.equal(byClass(columns[0], "pc-review-column__meta").length, 0);
  assert.equal(byClass(columns[0], "pc-review-content-card").length, 6);
  assert.ok(
    byClass(columns[0], "pc-review-content-card").every((card) =>
      ["content", "empty", "unavailable", "failed"].includes(card.dataset.reviewContentState)
    )
  );
  assert.equal(byClass(columns[1], "pc-review-content-card").length, 3);
  for (const section of sections) {
    const headers = byClass(section, "pc-review-member__header");
    assert.equal(headers.length, 1);
    assert.equal(section.children[0], headers[0]);
    const identity = byClass(section, "pc-review-member__identity")[0];
    assert.deepEqual(identity.children, [
      byClass(section, "pc-review-member__title")[0],
      byClass(section, "pc-review-member__dataset-name")[0],
    ]);
    assert.deepEqual(headers[0].children, [
      identity,
      byClass(section, "pc-review-member__meta")[0],
    ]);
    assert.equal(byClass(headers[0], "pc-review-content-card").length, 0);
    assert.ok(
      byClass(section, "pc-review-content-card__status").some(
        (node) => node.textContent === "Unavailable"
      )
    );
    assert.ok(
      byClass(section, "pc-review-content-card__status").some(
        (node) => node.textContent === "0 events"
      )
    );
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
  let board = createBoard({
    productItems: items,
    enabledDatasetNames: [packageNames[0]],
    products,
  });
  assert.equal(byClass(board, "pc-review-column").length, 1);
  assert.equal(byClass(board, "pc-review-content-card").length, 2);
  assert.ok(
    byClass(board, "pc-review-content-card").every(
      (node) => node.dataset.reviewContentType === "internal-validation-reports"
    )
  );
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
  const board = createBoard({
    productItems: items,
    enabledDatasetNames: [packageNames[0]],
    products: [{ ...product, refreshError: "Mapping rejected" }],
  });
  assert.equal(byClass(board, "pc-review-member").length, 2);
  assert.ok(nodes(board).some((node) => node.textContent === "Mapping rejected"));
  assert.equal(byClass(board, "pc-review-content-card").length, 6);
});

test("refreshing package A retains ordinary column DOM, scroll and disclosure state", async () => {
  const h = createReviewPackageFixture();
  const products = await loadReviewHistories([...packageNames, "Simple A"], h.options);
  products[1] = {
    ...products[1],
    history: {
      endpointAvailable: true,
      events: [
        {
          type: "status",
          title: "Stable history event",
          timestamp: "2026-10-01T12:00:00Z",
          details: [],
        },
      ],
    },
  };
  const items = list.createReviewProductItems([packageNames[0], "Simple A"]);
  const first = createBoard({
    productItems: items,
    enabledDatasetNames: items.map((item) => item.datasetName),
    products,
  });
  const columns = byClass(first, "pc-review-column");
  const ordinaryContent = byClass(columns[1], "pc-review-column__content")[0];
  const disclosure = byClass(columns[1], "pc-review-history-event")[0];
  ordinaryContent.scrollTop = 87;
  disclosure.open = true;
  h.controls.edition = 4;
  const [refreshed] = await loadReviewHistories([packageNames[0]], h.options);
  const next = createBoard({
    productItems: items,
    enabledDatasetNames: items.map((item) => item.datasetName),
    products: [refreshed, products[1]],
    previousBoard: first,
  });
  const nextColumns = byClass(next, "pc-review-column");
  assert.notEqual(nextColumns[0], columns[0]);
  assert.equal(nextColumns[1], columns[1]);
  assert.equal(byClass(nextColumns[1], "pc-review-column__content")[0].scrollTop, 87);
  assert.equal(byClass(nextColumns[1], "pc-review-history-event")[0], disclosure);
  assert.equal(disclosure.open, true);
});

test("Review hides redundant History record bounds while keeping event details", () => {
  const details = [
    { label: "Status", value: "Accepted" },
    { label: "From", value: "2026-01-01" },
    { label: "To", value: "Present" },
    { label: "Update", value: "2" },
    { label: "Owner", value: "User" },
    { label: "Edition", value: "4" },
  ];
  assert.deepEqual(
    Array.from(getVisibleEventDetails(details), (detail) => detail.label),
    ["Status", "Edition"]
  );
});

test("Review History uses explicit event presentation types for markers", () => {
  const common = {
    title: "Export: Failed",
    timestamp: "2026-11-01T09:00:00Z",
    details: [],
  };
  const outcomeNote = createCompactHistoryItem({
    ...common,
    type: "export",
    presentationType: "note",
  });
  assert.ok(outcomeNote.className.includes("pc-review-history-list__item--note"));
  assert.equal(
    byClass(outcomeNote, "pc-review-history-event__marker")[0].children[0].icon,
    "clock"
  );
  const successfulExport = createCompactHistoryItem({
    ...common,
    type: "export",
    presentationType: "export",
  });
  assert.equal(
    byClass(successfulExport, "pc-review-history-event__marker")[0].children[0].icon,
    "upload"
  );
  const transition = createCompactHistoryItem({ ...common, type: "status" });
  assert.equal(
    byClass(transition, "pc-review-history-event__marker")[0].children[0].icon,
    "information"
  );
});

test("Review status history icons use actual ProductState results when known", () => {
  const row = (value) =>
    createCompactHistoryItem({
      type: "status",
      timestamp: "2026-11-01T09:00:00Z",
      title: "Status changed",
      details: [{ label: "New status", value }],
    });
  const icon = (value) =>
    byClass(row(value), "pc-review-history-event__marker")[0].children[0].icon;
  assert.equal(icon("Error"), "x-circle");
  assert.equal(icon("Ready For Distribution"), "check");
  assert.equal(icon("Idle"), "clock");
  assert.equal(icon("Unknown backend state"), "information");
  assert.equal(icon("15"), "x-circle");
});
