import assert from "node:assert/strict";
import test from "node:test";
import { applyAppBranding, resolveBrandingUrl } from "./appBranding.js";

function createBrandingElements() {
  const events = new Map();
  const logo = {
    src: "/images/logo96.png",
    alt: "GST",
    addEventListener(type, handler, options) {
      events.set(type, { handler, once: options?.once });
    },
  };
  const favicon = { href: "/images/logo96.png" };

  return {
    logo,
    favicon,
    navbarElement: {
      querySelector: (selector) => (selector === ".navbar-logo" ? logo : null),
    },
    documentRef: {
      getElementById: (id) => (id === "data-catalogue-favicon" ? favicon : null),
    },
    failLogo() {
      events.get("error")?.handler();
    },
    listenerOptions: () => events.get("error"),
  };
}

test("default branding preserves the existing logo and provides a favicon", () => {
  const elements = createBrandingElements();
  applyAppBranding(elements);

  assert.equal(elements.logo.src, "/images/logo96.png");
  assert.equal(elements.logo.alt, "GST");
  assert.equal(elements.favicon.href, "/images/logo96.png");
  assert.equal(elements.listenerOptions(), undefined);
});

test("configured IIS virtual-directory branding is used on both workflows", () => {
  const elements = createBrandingElements();
  applyAppBranding({
    ...elements,
    config: {
      appLogoUrl: " /branding/Logo.png ",
      appLogoAlt: " Geodatastyrelsen ",
      appFaviconUrl: "/branding/Favicon.png",
    },
  });

  assert.equal(elements.logo.src, "/branding/Logo.png");
  assert.equal(elements.logo.alt, "Geodatastyrelsen");
  assert.equal(elements.favicon.href, "/branding/Favicon.png");
  assert.equal(elements.listenerOptions()?.once, true);
});

test("missing custom logo falls back without retrying the failed IIS asset", () => {
  const elements = createBrandingElements();
  applyAppBranding({
    ...elements,
    config: { appLogoUrl: "/branding/Missing.png", appLogoAlt: "Custom" },
  });
  elements.failLogo();

  assert.equal(elements.logo.src, "/images/logo96.png");
  assert.equal(elements.logo.alt, "GST");
});

test("empty, invalid and non-string logo and favicon URLs use safe defaults", () => {
  const elements = createBrandingElements();
  applyAppBranding({
    ...elements,
    config: {
      appLogoUrl: "javascript:alert(1)",
      appLogoAlt: "   ",
      appFaviconUrl: "data:image/svg+xml,unsafe",
    },
  });

  assert.equal(elements.logo.src, "/images/logo96.png");
  assert.equal(elements.logo.alt, "GST");
  assert.equal(elements.favicon.href, "/images/logo96.png");
  assert.equal(resolveBrandingUrl(undefined), "");
  assert.equal(resolveBrandingUrl("//unexpected.example/Logo.png"), "");
  assert.equal(resolveBrandingUrl(String.raw`\\server\share`), "");
  assert.equal(
    resolveBrandingUrl("https://assets.example/Logo.png"),
    "https://assets.example/Logo.png"
  );
});

test("missing branding markup fails visibly instead of silently losing branding", () => {
  const elements = createBrandingElements();
  assert.throws(
    () => applyAppBranding({ ...elements, navbarElement: { querySelector: () => null } }),
    /branding elements are missing/
  );
});
