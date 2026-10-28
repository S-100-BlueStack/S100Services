import assert from "node:assert/strict";
import test from "node:test";

import { initializeNavbarBranding } from "./navbarBranding.js";
import { resolveBranding } from "../../../shared/config/brandingConfig.js";

function createBranding(custom = true) {
  return resolveBranding({
    fallbackSrc: "/emitted/product-catalogue-logo.svg",
    env: {
      VITE_APP_LOGO_URL: custom ? "https://cdn.example.org/logo.svg" : "",
      VITE_APP_LOGO_ALT: "Example Organisation",
    },
  });
}

function createImage() {
  const image = new EventTarget();
  image.assignments = [];
  image.alt = "";
  let src;
  Object.defineProperty(image, "src", {
    get: () => src,
    set(value) {
      src = value;
      image.assignments.push({ src: value, alt: image.alt });
    },
  });
  image.removeAttribute = (name) => {
    assert.equal(name, "src");
    src = undefined;
  };
  return image;
}

test("sets the custom image synchronously without waiting for image loading", () => {
  const image = createImage();
  const branding = createBranding();
  assert.equal(initializeNavbarBranding(image, branding), undefined);
  assert.deepEqual(image.assignments, [{ src: branding.src, alt: "Example Organisation" }]);
});

test("custom image error applies generic source and alt exactly once", () => {
  const image = createImage();
  const branding = createBranding();
  initializeNavbarBranding(image, branding);
  image.dispatchEvent(new Event("error"));
  assert.equal(image.src, branding.fallbackSrc);
  assert.equal(image.alt, "Product Catalogue");
  assert.deepEqual(image.assignments, [
    { src: branding.src, alt: "Example Organisation" },
    { src: branding.fallbackSrc, alt: "Product Catalogue" },
  ]);

  assert.doesNotThrow(() => {
    image.dispatchEvent(new Event("error"));
    image.dispatchEvent(new Event("error"));
  });
  assert.equal(image.src, undefined);
  assert.equal(image.alt, "Product Catalogue");
  assert.equal(image.assignments.length, 2);
});

test("generic initial branding does not request a custom image or retry failed fallback", () => {
  const image = createImage();
  const branding = createBranding(false);
  initializeNavbarBranding(image, branding);
  assert.deepEqual(image.assignments, [{ src: branding.fallbackSrc, alt: "Product Catalogue" }]);
  image.dispatchEvent(new Event("error"));
  image.dispatchEvent(new Event("error"));
  assert.equal(image.assignments.length, 1);
  assert.equal(image.src, undefined);
  assert.equal(image.alt, "Product Catalogue");
});

test("separate navbar instances keep independent fallback state", () => {
  const first = createImage();
  const second = createImage();
  const branding = createBranding();
  initializeNavbarBranding(first, branding);
  first.dispatchEvent(new Event("error"));
  initializeNavbarBranding(second, branding);
  assert.equal(second.src, branding.src);
  second.dispatchEvent(new Event("error"));
  assert.equal(second.src, branding.fallbackSrc);
});

test("missing logo element does not block navbar initialization", () => {
  assert.doesNotThrow(() => initializeNavbarBranding(null, createBranding()));
});
