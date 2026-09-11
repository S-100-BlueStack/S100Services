import assert from "node:assert/strict";
import test from "node:test";

import { initializeFaviconBranding } from "./faviconBranding.js";
import { resolveFaviconBranding } from "../../../shared/config/brandingConfig.js";

const fallbackSrc = "/emitted/product-catalogue-logo.svg";

function createLink() {
  const link = new EventTarget();
  link.assignments = [];
  let href = fallbackSrc;
  Object.defineProperty(link, "href", {
    get: () => href,
    set(value) {
      href = value;
      link.assignments.push(value);
    },
  });
  return link;
}

function resolve(faviconUrl) {
  return resolveFaviconBranding({ fallbackSrc, env: { VITE_APP_FAVICON_URL: faviconUrl } });
}

for (const faviconUrl of [undefined, "", "   ", "data:image/png,icon"]) {
  test(`retains initial neutral favicon for ${JSON.stringify(faviconUrl)}`, () => {
    const link = createLink();
    initializeFaviconBranding(link, resolve(faviconUrl));
    link.dispatchEvent(new Event("error"));
    assert.equal(link.href, fallbackSrc);
    assert.deepEqual(link.assignments, []);
  });
}

test("assigns custom favicon synchronously without waiting for a load event", () => {
  const link = createLink();
  const customSrc = "https://cdn.example.org/favicon.png";
  assert.equal(initializeFaviconBranding(link, resolve(customSrc)), undefined);
  assert.equal(link.href, customSrc);
  assert.deepEqual(link.assignments, [customSrc]);
});

test("reported favicon failure restores neutral fallback once and cannot recurse", () => {
  const link = createLink();
  const customSrc = "/branding/favicon.ico";
  initializeFaviconBranding(link, resolve(customSrc));
  assert.doesNotThrow(() => link.dispatchEvent(new Event("error")));
  assert.equal(link.href, fallbackSrc);
  assert.doesNotThrow(() => {
    link.dispatchEvent(new Event("error"));
    link.dispatchEvent(new Event("error"));
  });
  assert.deepEqual(link.assignments, [customSrc, fallbackSrc]);
});

test("absence of favicon events does not retry or replace the configured URL", () => {
  const link = createLink();
  const customSrc = "/branding/favicon.png";
  initializeFaviconBranding(link, resolve(customSrc));
  assert.deepEqual(link.assignments, [customSrc]);
});

test("missing favicon link does not prevent application startup", () => {
  assert.doesNotThrow(() => initializeFaviconBranding(null, resolve("/branding/favicon.png")));
});
