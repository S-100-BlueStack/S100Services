import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Main-map Locator retains theme-aware icon contrast on navbar hover", async () => {
  const css = await readFile(
    new URL("../../../styles/main-map-locator.css", import.meta.url),
    "utf8"
  );
  const navbarLocator = css.match(/#header\s+\.main-map-locator__button\s*\{([^}]+)\}/)?.[1];

  assert.ok(navbarLocator, "Expected a navbar-specific Locator style");
  assert.match(navbarLocator, /--calcite-action-text-color:\s*var\(--pc-text\);/);
  assert.match(navbarLocator, /--calcite-action-text-color-press:\s*var\(--pc-text\);/);
  assert.match(
    css,
    /#header\s+\.main-map-locator__button:hover\s*\{[^}]*--calcite-action-background-color-hover:\s*var\(--pc-surface-alt\);/
  );
});
