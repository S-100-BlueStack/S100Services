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
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Element(), activeElement: null };
  t.after(() => {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  });
  const comparison = createReviewComparisonController();
  t.after(() => comparison.destroy());
  const board = new Element();
  const a = createColumn("A", 3, 200);
  const b = createColumn("B", 4, 400);
  const c = createColumn("C", 3, 200, false);
  board.append(a.column, b.column, c.column);
  comparison.connect(board);
  const checkboxes = () =>
    board
      .querySelector(".pc-review-comparison")
      .children.slice(1)
      .map((label) => label.children[0]);
  return { comparison, board, a, b, c, checkboxes };
}

function change(input, checked) {
  input.checked = checked;
  input.dispatchEvent(new Event("change"));
}

function scrollTo(element, top) {
  element.scrollTop = top;
  element.dispatchEvent(new Event("scroll"));
}

test("outer scroll synchronization is opt-in, maps matching sections and ignores echoes", (t) => {
  const { comparison, a, b, c, checkboxes } = setup(t);
  const [sync] = checkboxes();
  assert.equal(sync.checked, false);
  scrollTo(a.scroll, 50);
  assert.equal(b.scroll.scrollTop, 0);
  change(sync, true);
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

test("difference markers and comparison focus survive reconnect without duplicate controls", (t) => {
  const { comparison, board, c, checkboxes } = setup(t);
  const [, highlight] = checkboxes();
  assert.equal(highlight.checked, false);
  assert.equal(board.querySelectorAll(".pc-review-comparison-marker").length, 0);
  change(highlight, true);
  assert.equal(board.querySelectorAll(".pc-review-comparison-marker").length, 3);
  highlight.focus();
  c.column.remove();
  comparison.connect(board, document.activeElement);
  assert.equal(board.querySelectorAll(".pc-review-comparison").length, 1);
  assert.equal(board.querySelectorAll(".pc-review-comparison-marker").length, 2);
  assert.equal(checkboxes()[1].checked, true);
  assert.equal(document.activeElement, checkboxes()[1]);
  change(checkboxes()[1], false);
  assert.equal(board.querySelectorAll(".pc-review-comparison-marker").length, 0);
});
