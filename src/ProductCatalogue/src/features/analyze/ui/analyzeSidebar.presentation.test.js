import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const analyzeUiDirectory = new URL("./", import.meta.url);
const productCatalogueDirectory = new URL("../../../../", import.meta.url);

test("Analyze sidebar removes redundant visible labels while retaining accessible names", async () => {
  const source = await readFile(new URL("analyzeSidebar.js", analyzeUiDirectory), "utf8");

  assert.match(source, /panel\.setAttribute\("role", "region"\);/);
  assert.match(source, /panel\.setAttribute\("aria-label", "Analyze workspace"\);/);
  assert.match(source, /labelText: "Add product",\r?\n {4}showLabel: false,/);
  assert.match(source, /showDefaultHelp: false,/);
  assert.match(source, /title\.textContent = "Products";/);
  assert.doesNotMatch(source, /title\.textContent = "Product list";/);
  assert.doesNotMatch(source, /Add one product at a time/);
});

test("Analyze keeps the FI-022 Refresh action in the Product controls", async () => {
  const source = await readFile(new URL("analyzeSidebar.js", analyzeUiDirectory), "utf8");

  assert.match(
    source,
    /actions\.className = "analyze-products__actions";\r?\n {2}actions\.appendChild\(createWorkspaceRefreshButton\(datasetItems\)\);/
  );
  assert.match(source, /new CustomEvent\("pc-analyze-refresh", \{ bubbles: true \}\)/);
});

test("compact Product picker suppresses only normal help and retains exceptional messages", async () => {
  const pickerSource = await readFile(
    new URL("src/features/products/ui/productPicker.js", productCatalogueDirectory),
    "utf8"
  );

  const loadingMessageIndex = pickerSource.indexOf("Loading product catalog.");
  const errorMessageIndex = pickerSource.indexOf("Product catalog could not be loaded.");
  const defaultHelpGuardIndex = pickerSource.indexOf("if (!showDefaultHelp)");

  assert.ok(loadingMessageIndex >= 0);
  assert.ok(errorMessageIndex > loadingMessageIndex);
  assert.ok(defaultHelpGuardIndex > errorMessageIndex);
  assert.match(pickerSource, /help\.hidden = !help\.textContent;/);
  assert.match(pickerSource, /setMessage\(validation\.message\);/);
});

test("Analyze and existing Review surfaces use the neutral scrollbar contract", async () => {
  const [analyzeSource, reviewSidebarSource, reviewBoardSource, scrollbarCss] = await Promise.all([
    readFile(new URL("analyzeSidebar.js", analyzeUiDirectory), "utf8"),
    readFile(new URL("src/features/review/ui/reviewSidebar.js", productCatalogueDirectory), "utf8"),
    readFile(new URL("src/features/review/ui/reviewBoard.js", productCatalogueDirectory), "utf8"),
    readFile(new URL("src/styles/scrollbars.css", productCatalogueDirectory), "utf8"),
  ]);

  assert.match(analyzeSource, /analyze-sidebar__content pc-scrollbar/);
  assert.match(
    analyzeSource,
    /list\.className = "analyze-dataset-list__items";\r?\n {4}list\.classList\.add\("pc-scrollbar"\);/
  );
  assert.match(reviewSidebarSource, /pc-review-sidebar pc-scrollbar/);
  assert.match(reviewSidebarSource, /pc-review-product-list__items pc-scrollbar/);
  assert.match(reviewBoardSource, /pc-review-board__columns pc-scrollbar/);
  assert.match(scrollbarCss, /\.pc-scrollbar \{/);
  assert.doesNotMatch(scrollbarCss, /analyze|review/);
});

test("Analyze Product list uses a responsive viewport without fixed row heights", async () => {
  const css = await readFile(new URL("src/styles/analyze.css", productCatalogueDirectory), "utf8");

  assert.match(css, /max-height: clamp\(7\.5rem, 22dvh, 9rem\);/);
  assert.match(css, /overflow-wrap: anywhere;/);
  assert.doesNotMatch(css, /\.analyze-dataset-list__item\s*\{[^}]*\bheight:/);
});
