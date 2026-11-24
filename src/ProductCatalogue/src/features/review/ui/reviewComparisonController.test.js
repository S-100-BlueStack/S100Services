import assert from "node:assert/strict";
import test from "node:test";
import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { createReviewComparisonController } from "./reviewComparisonController.js";

// Exercise native event ownership without an ArcGIS or Calcite runtime.
class Element extends EventTarget {
  constructor(className = "") {
    super();
    this.className = className;
    this.children = [];
    this.dataset = {};
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    this.clientHeight = 100;
    this.clientTop = 0;
    this.classList = {
      add: (name) => (this.className += ` ${name}`),
      remove: (name) => {
        this.className = this.className
          .split(" ")
          .filter((value) => value !== name)
          .join(" ");
      },
    };
  }
  appendChild(child) {
    this.append(child);
    return child;
  }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    }
  }
  prepend(child) {
    this.append(child);
    this.children.unshift(this.children.pop());
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  contains(element) {
    return this === element || this.children.some((child) => child.contains(element));
  }
  querySelectorAll(selector) {
    const matches = (node) => node.className.split(" ").includes(selector.slice(1));
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  getBoundingClientRect() {
    return { top: 0, height: 100 };
  }
  focus() {
    document.activeElement = this;
  }
}

function createColumn(name, edition, height, withHistory = true) {
  const column = new Element("pc-review-column");
  const productContext = {
    datasetName: name,
    sourceId: "s101",
    productKey: name,
    productType: "electronic-product",
    data: { attributes: { productSpecification: "S101", edition } },
  };
  productContext.identityKey = serializeProductIdentity(productContext);
  column.reviewRenderProduct = { datasetName: name, productContext, loadState: "loaded" };
  const header = new Element("pc-review-column__header");
  const scroll = new Element("pc-review-column__content");
  const card = new Element("pc-review-content-card");
  card.dataset.reviewContentType = "history";
  card.getBoundingClientRect = () => ({ top: -scroll.scrollTop, height });
  const nested = new Element("pc-review-content-card__body--scrollable");
  card.append(nested);
  if (withHistory) scroll.append(card);
  column.append(header, scroll);
  return { column, scroll, nested };
}

function setup(t) {
  const comparison = createReviewComparisonController();
  t.after(() => comparison.destroy());
  const board = new Element();
  const a = createColumn("A", 3, 200);
  const b = createColumn("B", 4, 400);
  const c = createColumn("C", 3, 200, false);
  board.append(a.column, b.column, c.column);
  comparison.connect(board);
  return { comparison, board, a, b, c };
}

function scrollTo(element, top) {
  element.scrollTop = top;
  element.dispatchEvent(new Event("scroll"));
}

test("outer scroll synchronization is opt-in, maps matching sections and ignores echoes", (t) => {
  const { comparison, board, a, b, c } = setup(t);
  assert.equal(board.querySelector(".pc-review-comparison"), null);
  scrollTo(a.scroll, 50);
  assert.equal(b.scroll.scrollTop, 0);
  comparison.setSyncScrolling(true);
  assert.equal(b.scroll.scrollTop, 0);
  scrollTo(a.scroll, 100);
  assert.equal(b.scroll.scrollTop, 200);
  assert.equal(c.scroll.scrollTop, 0);
  b.scroll.dispatchEvent(new Event("scroll"));
  assert.equal(a.scroll.scrollTop, 100);
  scrollTo(a.nested, 40);
  assert.equal(b.scroll.scrollTop, 200);
  comparison.destroy();
  scrollTo(a.scroll, 150);
  assert.equal(b.scroll.scrollTop, 200);
});

test("the setting survives reconnect and disabling restores independent scrolling", (t) => {
  const { comparison, board, a, b, c } = setup(t);
  comparison.setSyncScrolling(true);
  scrollTo(a.scroll, 100);
  assert.equal(b.scroll.scrollTop, 200);
  c.column.remove();
  comparison.connect(board);
  assert.equal(board.querySelector(".pc-review-comparison"), null);
  assert.equal(board.querySelector(".pc-review-comparison-marker"), null);
  scrollTo(a.scroll, 150);
  assert.equal(b.scroll.scrollTop, 300);
  comparison.setSyncScrolling(false);
  scrollTo(a.scroll, 50);
  assert.equal(b.scroll.scrollTop, 300);
  comparison.setSyncScrolling(true);
  assert.equal(b.scroll.scrollTop, 300);
  scrollTo(a.scroll, 75);
  assert.equal(b.scroll.scrollTop, 150);
});
