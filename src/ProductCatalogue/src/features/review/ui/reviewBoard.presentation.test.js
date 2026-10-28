import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reviewUiDirectory = new URL("./", import.meta.url);
const productCatalogueDirectory = new URL("../../../../", import.meta.url);

test("Review content cards expose only the intentional History nested-scroll contract", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("reviewBoard.js", reviewUiDirectory), "utf8"),
    readFile(new URL("src/styles/review.css", productCatalogueDirectory), "utf8"),
  ]);

  assert.match(
    source,
    /if \(contentType === REVIEW_CONTENT_TYPES\.HISTORY\) \{\s*body\.classList\.add\("pc-review-content-card__body--scrollable", "pc-scrollbar"\);\s*\}/s
  );
  assert.doesNotMatch(source, /body\.className = "pc-review-content-card__body pc-scrollbar";/);
  assert.match(
    css,
    /\.pc-review-content-card--history\s*\{[^}]*max-height: var\(--pc-review-history-card-max-height\);/s
  );
  assert.doesNotMatch(css, /\.pc-review-content-card--history\s*\{[^}]*\n\s*height:/s);
  assert.match(css, /\.pc-review-content-card__body\s*\{[^}]*overflow: visible;/s);
  assert.match(css, /\.pc-review-content-card__body--scrollable\s*\{[^}]*overflow: auto;/s);
});

test("Review keeps validation artifact download links for available content", async () => {
  const source = await readFile(new URL("reviewBoard.js", reviewUiDirectory), "utf8");

  assert.match(source, /link\.href = artifact\.url;/);
  assert.match(source, /link\.download = artifact\.fileName \|\| "";/);
  assert.match(source, /card\.body\.appendChild\(createValidationArtifactRow\(artifact\)\);/);
});
