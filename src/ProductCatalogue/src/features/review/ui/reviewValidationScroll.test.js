import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { REVIEW_CONTENT_TYPES } from "../domain/reviewProductList.js";

// Exercise the production card renderer with a small DOM and a controlled
// validation presentation boundary; API/presentation contracts have separate tests.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = "";
    this.dataset = {};
    this.children = [];
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
const source = (await readFile(new URL("./reviewBoard.js", import.meta.url), "utf8"))
  .replace(/^import "[^"]+";\s*/gm, "")
  .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
  .replace("export function createReviewBoard", "function createReviewBoard");
const createValidationCard = runInNewContext(`${source}\ncreateReviewContentCard;`, {
  document,
  REVIEW_CONTENT_TYPES,
  REVIEW_CONTENT_PRESENTATION_STATE: { CONTENT: "content" },
  getReviewValidationPresentation: (product) =>
    product.artifactError
      ? { status: "Failed", state: "failed", message: product.artifactError }
      : product.validationArtifacts.length
        ? { status: `${product.validationArtifacts.length} files`, state: "content" }
        : { status: "0 files", state: "empty", message: "No validation reports found." },
});
const descendants = (root) => [root, ...root.children.flatMap(descendants)];
const byClass = (root, name) =>
  descendants(root).filter((node) => node.className.split(" ").includes(name));
const createProduct = (count) => ({
  datasetName: "Review A",
  validationArtifacts: Array.from({ length: count }, (_, index) => ({
    url: `https://example.test/report-${index}.xml`,
    fileName: `report-${index}.xml`,
    productSpecificationLabel: "S-101",
  })),
});

for (const count of [0, 1, 5, 6, 20]) {
  test(`Review exposes all ${count} validation files with bounded scrolling only for long lists`, () => {
    const product = createProduct(count);
    const card = createValidationCard(product, REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS);
    const body = byClass(card, "pc-review-content-card__body")[0];
    const bounded = count > 5;

    assert.equal(byClass(card, "pc-review-content-card--validation-bounded").length, Number(bounded));
    assert.equal(byClass(body, "pc-review-content-card__body--scrollable").length, Number(bounded));
    assert.equal(byClass(body, "pc-scrollbar").length, Number(bounded));
    assert.equal(body.attributes.role, bounded ? "region" : undefined);
    assert.equal(body.attributes["aria-label"], undefined);
    assert.equal(
      body.attributes["aria-labelledby"],
      bounded ? byClass(card, "pc-review-content-card__title")[0].id : undefined
    );
    if (bounded) assert.ok(byClass(card, "pc-review-content-card__title")[0].id);
    assert.equal(body.tabIndex, bounded ? 0 : undefined);
    assert.equal(byClass(body, "pc-review-content-card__artifact").length, count);
    assert.deepEqual(
      descendants(body)
        .filter((node) => node.tagName === "calcite-link")
        .map((node) => node.href),
      product.validationArtifacts.map((artifact) => artifact.url)
    );
    assert.deepEqual(
      descendants(body)
        .filter((node) => node.tagName === "calcite-link")
        .map((node) => node.download),
      product.validationArtifacts.map((artifact) => artifact.fileName)
    );
  });
}

test("Review failed validation leaves the normal error card and no scroll region", () => {
  const product = { ...createProduct(20), artifactError: "Read failed" };
  const card = createValidationCard(product, REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS);
  assert.equal(byClass(card, "pc-review-content-card--validation-bounded").length, 0);
  assert.equal(byClass(card, "pc-review-content-card__artifact").length, 0);
  assert.ok(descendants(card).some((node) => node.textContent === "Read failed"));
});

test("Review labels successive validation scroll regions without hover help", () => {
  const first = createValidationCard(createProduct(6), REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS);
  const second = createValidationCard(createProduct(6), REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS);
  const firstBody = byClass(first, "pc-review-content-card__body")[0];
  const secondBody = byClass(second, "pc-review-content-card__body")[0];

  assert.notEqual(firstBody.attributes["aria-labelledby"], secondBody.attributes["aria-labelledby"]);
  assert.equal(firstBody.attributes["aria-label"], undefined);
  assert.equal(secondBody.attributes["aria-label"], undefined);
  assert.equal(byClass(first, "pc-review-content-card__title")[0].textContent, "Internal validation");
});
