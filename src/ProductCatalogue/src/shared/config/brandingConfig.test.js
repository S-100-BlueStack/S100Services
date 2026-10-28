import assert from "node:assert/strict";
import test from "node:test";

import { resolveBranding, resolveFaviconBranding } from "./brandingConfig.js";

const fallbackSrc = "/emitted/product-catalogue-logo.svg";

function resolve(logoUrl, logoAlt, baseUrl = "/product-catalogue/", documentUrl) {
  return resolveBranding({
    fallbackSrc,
    documentUrl: documentUrl ?? "https://app.example.org/product-catalogue/dashboard/",
    env: {
      BASE_URL: baseUrl,
      VITE_APP_LOGO_URL: logoUrl,
      VITE_APP_LOGO_ALT: logoAlt,
    },
  });
}

for (const logoUrl of [undefined, null, "", "   ", 42]) {
  test(`uses generic branding for missing or non-string URL: ${JSON.stringify(logoUrl)}`, () => {
    assert.deepEqual(resolve(logoUrl, "Example Organisation"), {
      src: fallbackSrc,
      alt: "Product Catalogue",
      fallbackSrc,
      fallbackAlt: "Product Catalogue",
      usesCustomLogo: false,
    });
  });
}

for (const logoUrl of ["branding/logo.svg", "./branding/logo.svg"]) {
  test(`resolves ${logoUrl} beneath the application base, not the current route`, () => {
    assert.equal(
      resolve(logoUrl).src,
      "https://app.example.org/product-catalogue/branding/logo.svg"
    );
  });
}

test("preserves origin-root-relative paths", () => {
  assert.equal(resolve("/branding/logo.svg").src, "/branding/logo.svg");
});

for (const logoUrl of ["https://cdn.example.org/logo.svg", "http://localhost:8080/logo.svg"]) {
  test(`preserves absolute URL ${logoUrl}`, () => {
    assert.equal(resolve(logoUrl).src, logoUrl);
    assert.equal(resolve(logoUrl).usesCustomLogo, true);
  });
}

for (const logoUrl of [
  "javascript:alert(1)",
  "data:image/svg+xml,logo",
  "file:///logo.svg",
  "ftp://example.org/logo.svg",
  "https://",
  "http://[invalid/logo.svg",
  "https:logo.svg",
  "//cdn.example.org/logo.svg",
  "branding\\logo.svg",
  "java\nscript:alert(1)",
]) {
  test(`fails closed for unsupported or malformed URL ${JSON.stringify(logoUrl)}`, () => {
    const branding = resolve(logoUrl, "Example Organisation");
    assert.equal(branding.src, fallbackSrc);
    assert.equal(branding.alt, "Product Catalogue");
    assert.equal(branding.usesCustomLogo, false);
  });
}

test("trims custom URL and alt", () => {
  const branding = resolve("  branding/logo.svg  ", "  Example Organisation  ");
  assert.equal(branding.src, "https://app.example.org/product-catalogue/branding/logo.svg");
  assert.equal(branding.alt, "Example Organisation");
});

for (const logoAlt of [undefined, null, "", "   "]) {
  test(`uses generic alt for custom logo with missing alt ${JSON.stringify(logoAlt)}`, () => {
    assert.equal(resolve("branding/logo.svg", logoAlt).alt, "Product Catalogue");
  });
}

test("supports nested, root, relative, and absolute Vite bases", () => {
  for (const [base, expected] of [
    ["/apps/catalogue/", "https://app.example.org/apps/catalogue/branding/logo.svg"],
    ["/", "https://app.example.org/branding/logo.svg"],
    ["./", "https://app.example.org/product-catalogue/dashboard/branding/logo.svg"],
    ["", "https://app.example.org/product-catalogue/dashboard/branding/logo.svg"],
    ["https://static.example.org/app/", "https://static.example.org/app/branding/logo.svg"],
  ]) {
    assert.equal(resolve("./branding/logo.svg", undefined, base).src, expected);
  }
});

test("normalizes dot segments while preserving path segments, query, and fragment", () => {
  assert.equal(
    resolve("./branding/../shared/my logo.svg?v=2#mark").src,
    "https://app.example.org/product-catalogue/shared/my%20logo.svg?v=2#mark"
  );
});

test("missing environment and malformed URL context cannot throw", () => {
  assert.equal(resolveBranding({ fallbackSrc, env: null }).src, fallbackSrc);
  assert.equal(resolve("branding/logo.svg", undefined, "/app/", "invalid").src, fallbackSrc);
});

function resolveFavicon(faviconUrl, overrides = {}) {
  return resolveFaviconBranding({
    fallbackSrc,
    documentUrl: "https://app.example.org/product-catalogue/dashboard/",
    env: {
      BASE_URL: "/product-catalogue/",
      VITE_APP_FAVICON_URL: faviconUrl,
      ...overrides,
    },
  });
}

for (const faviconUrl of [undefined, null, "", "   ", 42]) {
  test(`uses generic favicon for missing or non-string URL: ${JSON.stringify(faviconUrl)}`, () => {
    assert.deepEqual(resolveFavicon(faviconUrl), {
      src: fallbackSrc,
      fallbackSrc,
      usesCustomFavicon: false,
    });
  });
}

for (const faviconUrl of ["branding/favicon.png", "./branding/favicon.png"]) {
  test(`resolves favicon ${faviconUrl} beneath the application base`, () => {
    assert.equal(
      resolveFavicon(faviconUrl).src,
      "https://app.example.org/product-catalogue/branding/favicon.png"
    );
  });
}

test("preserves origin-root-relative favicon URL", () => {
  assert.equal(resolveFavicon("/branding/favicon.png").src, "/branding/favicon.png");
});

for (const faviconUrl of [
  "https://cdn.example.org/favicon.png",
  "http://localhost:8080/favicon.png",
]) {
  test(`preserves absolute favicon URL ${faviconUrl}`, () => {
    assert.equal(resolveFavicon(faviconUrl).src, faviconUrl);
    assert.equal(resolveFavicon(faviconUrl).usesCustomFavicon, true);
  });
}

for (const faviconUrl of [
  "javascript:alert(1)",
  "data:image/svg+xml,icon",
  "file:///favicon.png",
  "ftp://example.org/favicon.png",
  "https://",
  "//cdn.example.org/favicon.png",
  "branding\\favicon.png",
  "java\nscript:alert(1)",
]) {
  test(`fails closed for unsupported favicon URL ${JSON.stringify(faviconUrl)}`, () => {
    const branding = resolveFavicon(faviconUrl);
    assert.equal(branding.src, fallbackSrc);
    assert.equal(branding.usesCustomFavicon, false);
  });
}

test("trims favicon configuration", () => {
  assert.equal(resolveFavicon("  /branding/favicon.png  ").src, "/branding/favicon.png");
});

test("logo and favicon use identical URL resolution semantics", () => {
  const urls = [
    "branding/icon.svg",
    "./branding/../shared/my icon.svg?v=2#mark",
    "/branding/icon.svg",
    "https://cdn.example.org/icon.svg",
    "http://localhost:8080/icon.svg",
    "data:image/png,icon",
    "https://",
  ];
  for (const base of ["/", "/apps/catalogue/", "./", "https://static.example.org/app/"]) {
    for (const url of urls) {
      assert.equal(resolveFavicon(url, { BASE_URL: base }).src, resolve(url, undefined, base).src);
    }
  }
});

test("logo and favicon configuration remain independent", () => {
  const options = {
    fallbackSrc,
    env: {
      VITE_APP_LOGO_URL: "/branding/logo.png",
      VITE_APP_LOGO_ALT: "Example Hydrographic Office",
      VITE_APP_FAVICON_URL: "/branding/favicon.ico",
    },
  };
  assert.equal(resolveBranding(options).src, "/branding/logo.png");
  assert.equal(resolveBranding(options).alt, "Example Hydrographic Office");
  assert.equal(resolveFaviconBranding(options).src, "/branding/favicon.ico");

  delete options.env.VITE_APP_FAVICON_URL;
  assert.equal(resolveFaviconBranding(options).src, fallbackSrc);
  assert.equal(resolveBranding(options).src, "/branding/logo.png");

  options.env.VITE_APP_FAVICON_URL = "/branding/favicon.ico";
  delete options.env.VITE_APP_LOGO_URL;
  assert.equal(resolveBranding(options).src, fallbackSrc);
  assert.equal(resolveBranding(options).alt, "Product Catalogue");
  assert.equal(resolveFaviconBranding(options).src, "/branding/favicon.ico");
});

test("missing favicon environment uses fallback without throwing", () => {
  assert.equal(resolveFaviconBranding({ fallbackSrc, env: null }).src, fallbackSrc);
});
