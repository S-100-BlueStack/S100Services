import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reviewUiDirectory = new URL("./", import.meta.url);
const productCatalogueDirectory = new URL("../../../../", import.meta.url);

test("Review sidebar removes redundant chrome and retains accessible names", async () => {
  const [source, pageSource] = await Promise.all([
    readFile(new URL("reviewSidebar.js", reviewUiDirectory), "utf8"),
    readFile(new URL("reviewPage.js", reviewUiDirectory), "utf8"),
  ]);

  assert.match(
    source,
    /sidebar\.setAttribute\("aria-label", "Product Review workspace controls"\);/
  );
  assert.match(pageSource, /page\.setAttribute\("aria-label", "Product Review"\);/);
  assert.match(source, /labelText: "Add product",\r?\n {4}showLabel: false,/);
  assert.match(source, /showDefaultHelp: false,/);
  assert.match(source, /title\.textContent = "Products";/);
  assert.doesNotMatch(source, /eyebrow\.textContent = "Workspace";/);
  assert.doesNotMatch(source, /title\.textContent = "Product Review";/);
  assert.doesNotMatch(source, /Collect products and choose/);
  assert.doesNotMatch(source, /Add one product at a time/);
});

test("Review has one icon-only Refresh before the Product counter", async () => {
  const [source, reviewCss] = await Promise.all([
    readFile(new URL("reviewSidebar.js", reviewUiDirectory), "utf8"),
    readFile(new URL("src/styles/review.css", productCatalogueDirectory), "utf8"),
  ]);

  assert.match(
    source,
    /controls\.append\(createWorkspaceRefreshButton\(productItems, loading\), count\);/
  );
  assert.equal(source.match(/new CustomEvent\("pc-review-refresh"/g)?.length, 1);
  assert.match(source, /button\.className = "pc-review-product-list__refresh-button";/);
  assert.match(source, /const icon = document\.createElement\("calcite-icon"\);/);
  assert.match(source, /icon\.icon = "refresh";/);
  assert.doesNotMatch(source, /button\.textContent = "Refresh";/);
  assert.doesNotMatch(reviewCss, /pc-review-workspace-refresh/);
  assert.match(source, /button\.title = "Refresh Product Review workspace data\.";/);
  assert.match(
    source,
    /button\.setAttribute\("aria-label", "Refresh Product Review workspace data"\);/
  );
  assert.match(
    source,
    /button\.disabled = loading \|\| !productItems\.some\(\(item\) => item\.enabled\);/
  );
});

test("Review opts into an anchored Product picker results overlay", async () => {
  const [reviewSource, analyzeSource, pickerSource, pickerCss, reviewCss] = await Promise.all([
    readFile(new URL("reviewSidebar.js", reviewUiDirectory), "utf8"),
    readFile(
      new URL("src/features/analyze/ui/analyzeSidebar.js", productCatalogueDirectory),
      "utf8"
    ),
    readFile(
      new URL("src/features/products/ui/productPicker.js", productCatalogueDirectory),
      "utf8"
    ),
    readFile(new URL("src/styles/product-picker.css", productCatalogueDirectory), "utf8"),
    readFile(new URL("src/styles/review.css", productCatalogueDirectory), "utf8"),
  ]);

  assert.match(reviewSource, /overlayResults: true,/);
  assert.doesNotMatch(analyzeSource, /overlayResults: true,/);
  assert.match(pickerSource, /overlayResults = false,/);
  assert.match(pickerSource, /pc-product-picker__control--overlay/);
  assert.match(pickerSource, /control\.append\(row, help, results\);/);
  assert.match(
    pickerCss,
    /\.pc-product-picker__control--overlay \.pc-product-picker__results\s*\{[^}]*position: absolute;/s
  );
  assert.match(reviewCss, /\.pc-review-product-form\s*\{[^}]*z-index: 1;/s);
});

test("compact Review Product picker retains contextual and validation messages", async () => {
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

test("Review content toggles use the bounded Product-list snapshot", async () => {
  const [sidebarSource, pageSource, coreSource] = await Promise.all([
    readFile(new URL("reviewSidebar.js", reviewUiDirectory), "utf8"),
    readFile(new URL("reviewPage.js", reviewUiDirectory), "utf8"),
    readFile(
      new URL("src/features/review/core/initReviewPage.js", productCatalogueDirectory),
      "utf8"
    ),
  ]);

  assert.match(sidebarSource, /checkbox\.dataset\.reviewProductId = productItem\.id;/);
  assert.match(sidebarSource, /checkbox\.dataset\.reviewContentType = definition\.id;/);
  assert.match(
    sidebarSource,
    /checkbox\.addEventListener\("change", \(\) => \{\s*dispatchReviewContentToggle/s
  );
  assert.match(
    coreSource,
    /const productListInteraction = captureReviewProductListInteraction\(\);/
  );
  assert.match(coreSource, /renderCurrentReviewPage\(\{ productListInteraction \}\);/);
  assert.match(
    pageSource,
    /restoreReviewProductListInteraction\(productListInteraction, \{ page \}\);/
  );
});

test("Review workspace content controls use native aggregate checkbox state", async () => {
  const [sidebarSource, coreSource, pageSource] = await Promise.all([
    readFile(new URL("reviewSidebar.js", reviewUiDirectory), "utf8"),
    readFile(
      new URL("src/features/review/core/initReviewPage.js", productCatalogueDirectory),
      "utf8"
    ),
    readFile(new URL("reviewPage.js", reviewUiDirectory), "utf8"),
  ]);

  assert.match(sidebarSource, /legend\.textContent = "Content";/);
  assert.match(sidebarSource, /checkbox\.checked = aggregateState === "all-enabled";/);
  assert.match(sidebarSource, /checkbox\.indeterminate = aggregateState === "mixed";/);
  assert.match(sidebarSource, /checkbox\.disabled = aggregateState === "empty";/);
  assert.match(sidebarSource, /checkbox\.dataset\.reviewWorkspaceContentType = definition\.id;/);
  assert.match(sidebarSource, /`\$\{definition\.label\} for all Review Products`/);
  assert.match(sidebarSource, /new CustomEvent\("pc-review-content-bulk-toggle"/);
  assert.match(coreSource, /captureReviewWorkspaceContentInteraction\(\)/);
  assert.match(pageSource, /restoreReviewWorkspaceContentInteraction/);
  assert.doesNotMatch(coreSource, /scrollIntoView/);
});
