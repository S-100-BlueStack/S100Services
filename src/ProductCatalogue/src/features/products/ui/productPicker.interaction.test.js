import assert from "node:assert/strict";
import test from "node:test";
import { createProductPickerForm } from "./productPicker.js";
import {
  captureReviewPickerInteraction,
  restoreReviewPickerInteraction,
} from "../../review/ui/reviewPickerInteraction.js";

// Exercise the actual picker and Review focus-restoration handlers using a
// minimal public DOM surface, without depending on ArcGIS or Calcite internals.
function withPickerDom(run) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;

  class Element {
    children = [];
    attributes = new Map();
    dataset = {};
    className = "";
    hidden = false;
    value = "";
    listeners = new Map();
    parentElement = null;

    constructor(tagName) {
      this.tagName = tagName;
    }
    get classList() {
      return {
        add: (name) => {
          if (!this.className.split(/\s+/).includes(name)) this.className += ` ${name}`;
        },
        remove: (name) => {
          this.className = this.className
            .split(/\s+/)
            .filter((value) => value !== name)
            .join(" ");
        },
      };
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) ?? []) listener(event);
      if (event.bubbles && this.parentElement) this.parentElement.dispatchEvent(event);
      return true;
    }
    emit(type, details = {}) {
      const event = {
        type,
        target: this,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...details,
      };
      this.dispatchEvent(event);
      return event;
    }
    append(...elements) {
      for (const element of elements) {
        if (element.parentElement) {
          element.parentElement.children = element.parentElement.children.filter(
            (child) => child !== element
          );
        }
        element.parentElement = this;
        this.children.push(element);
      }
    }
    appendChild(element) {
      this.append(element);
      return element;
    }
    replaceChildren(...elements) {
      for (const child of this.children) child.parentElement = null;
      this.children = [];
      this.append(...elements);
    }
    contains(element) {
      return element === this || this.children.some((child) => child.contains(element));
    }
    querySelectorAll(selector) {
      const match = (element) =>
        selector.startsWith(".") && element.className.split(/\s+/).includes(selector.slice(1));
      return this.children.flatMap((child) => [
        ...(match(child) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    closest(selector) {
      for (let element = this; element; element = element.parentElement) {
        if (element.className.split(/\s+/).includes(selector.slice(1))) return element;
      }
      return null;
    }
    focus() {
      if (doc.activeElement === this) return;
      const previous = doc.activeElement;
      doc.activeElement = this;
      previous?.emit("blur");
      this.emit("focus");
    }
    click() {
      this.focus();
      this.emit("click", { detail: 1 });
    }
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  }

  const doc = { activeElement: null, createElement: (tag) => new Element(tag) };
  doc.body = new Element("body");
  globalThis.document = doc;
  globalThis.window = { setTimeout };
  try {
    return run({ doc });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

const products = [{ name: "PRIMARY" }, { name: "SECONDARY" }];

function createReviewPicker() {
  return createProductPickerForm({
    id: "review-product-input",
    eventName: "pc-review-product-add",
    suppressResultsOnCommit: true,
    products,
    requireCatalogMatch: true,
  });
}

test("Review picker closes on selection but reopens on the first click without blurring", () => {
  withPickerDom(({ doc }) => {
    const page = doc.body.appendChild(doc.createElement("main"));
    const form = createReviewPicker();
    page.append(form);
    const input = page.querySelector(".pc-product-picker__input");
    const results = page.querySelector(".pc-product-picker__results");
    let submitted = null;
    form.addEventListener("pc-review-product-add", (event) => {
      submitted = event.detail.productNames;
    });

    input.focus();
    assert.equal(results.hidden, false);
    results.querySelector(".pc-product-picker__option").click();
    assert.deepEqual(submitted, ["PRIMARY"]);
    assert.equal(results.hidden, true);
    assert.equal(doc.activeElement, input);

    const interaction = captureReviewPickerInteraction(page, doc.activeElement);
    assert.equal(interaction.committed, true);
    page.replaceChildren(createReviewPicker());
    restoreReviewPickerInteraction(page, interaction);
    const nextInput = page.querySelector(".pc-product-picker__input");
    const nextResults = page.querySelector(".pc-product-picker__results");
    assert.equal(doc.activeElement, nextInput);
    assert.equal(nextResults.hidden, true, "status rerender keeps committed results closed");

    nextInput.click();
    assert.equal(doc.activeElement, nextInput, "click does not need a new focus event");
    assert.equal(nextResults.hidden, false);
    assert.equal(nextInput.getAttribute("aria-expanded"), "true");
    assert.equal(nextInput.dataset.productPickerSuppressResults, undefined);
  });
});

test("Review picker reopens by ArrowDown while the committed field is still focused", () => {
  withPickerDom(({ doc }) => {
    const page = doc.body.appendChild(doc.createElement("main"));
    const form = createReviewPicker();
    page.append(form);
    const input = page.querySelector(".pc-product-picker__input");
    const results = page.querySelector(".pc-product-picker__results");
    input.dataset.productPickerSuppressResults = "true";
    input.focus();
    assert.equal(results.hidden, true);

    const arrowDown = input.emit("keydown", { key: "ArrowDown" });
    assert.equal(arrowDown.defaultPrevented, true);
    assert.equal(results.hidden, false);
    assert.equal(doc.activeElement, results.querySelector(".pc-product-picker__option"));
    assert.equal(input.dataset.productPickerSuppressResults, undefined);
  });
});
