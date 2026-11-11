import assert from "node:assert/strict";
import test from "node:test";
import { applyDocumentTheme } from "./applyDocumentTheme.js";

test("theme switching uses color-scheme and the application theme attribute", () => {
  const documentElement = { dataset: {}, style: {} };

  applyDocumentTheme({ documentElement, themeMode: "dark" });
  assert.equal(documentElement.style.colorScheme, "dark");
  assert.equal(documentElement.dataset.theme, "dark");

  applyDocumentTheme({ documentElement, themeMode: "light" });
  assert.equal(documentElement.style.colorScheme, "light");
  assert.equal(documentElement.dataset.theme, "light");
});

test("unknown theme values resolve safely to light", () => {
  const documentElement = { dataset: {}, style: {} };
  applyDocumentTheme({ documentElement, themeMode: "unknown" });
  assert.equal(documentElement.style.colorScheme, "light");
  assert.equal(documentElement.dataset.theme, "light");
});
