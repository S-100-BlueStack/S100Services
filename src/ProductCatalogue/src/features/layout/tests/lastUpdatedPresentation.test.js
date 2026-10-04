import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLastUpdatedPresentation,
  createLastUpdatedPresentation,
  createRefreshingPresentation,
  readLastUpdatedPresentation,
} from "../services/lastUpdatedPresentation.js";

class FakeElement {
  constructor() {
    this.textContent = "";
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

test("formats a successful refresh as compact HH:MM with full local context", () => {
  const presentation = createLastUpdatedPresentation(new Date(2026, 8, 16, 9, 7, 23));

  assert.equal(presentation.text, "09:07");
  assert.doesNotMatch(presentation.text, /Updated/i);
  assert.match(presentation.title, /^Last successful data refresh: /);
  assert.equal(presentation.ariaLabel, presentation.title);
});

test("restores the complete last-successful presentation after temporary refresh feedback", () => {
  const element = new FakeElement();
  const successful = createLastUpdatedPresentation(new Date(2026, 8, 16, 14, 35));
  applyLastUpdatedPresentation(element, successful);
  const snapshot = readLastUpdatedPresentation(element);

  applyLastUpdatedPresentation(element, createRefreshingPresentation());
  assert.equal(element.textContent, "Refreshing...");

  applyLastUpdatedPresentation(element, snapshot);
  assert.deepEqual(readLastUpdatedPresentation(element), successful);
});
