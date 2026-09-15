import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appDirectory = new URL("./", import.meta.url);

async function readAppFile(fileName) {
  return readFile(new URL(fileName, appDirectory), "utf8");
}

test("loadInitialData delegates compatibility and runtime sources to independent startup tasks", async () => {
  const source = await readAppFile("loadInitialData.js");

  assert.match(source, /import \{ runInitialDataStartup \} from "\.\/initialDataStartup\.js";/);
  assert.match(source, /loadCompatibilityData:\s*async \(\) => \{/);
  assert.match(source, /const result = await loadCompatibilityAoiData\(app, loaderProgress\);/);
  assert.match(source, /sourceProgress\.begin\(\);/);
  assert.match(
    source,
    /initializeRuntimeSources:\s*\(\) => app\.dataSourceController\?\.initialize\?\.\(\)/
  );

  assert.ok(
    source.indexOf("await loadCompatibilityAoiData(app, loaderProgress)") <
      source.indexOf("sourceProgress.begin()"),
    "source progress should begin only after compatibility AOI loading completes"
  );
});

test("loadInitialData preserves separate failure handling for both startup pipelines", async () => {
  const source = await readAppFile("loadInitialData.js");

  assert.match(source, /startupResult\.runtimeSources\.status === "rejected"/);
  assert.match(source, /Data sources could not be initialized/);
  assert.match(source, /startupResult\.compatibility\.status === "rejected"/);
  assert.match(source, /loaderProgress\.fail\(\{[\s\S]*?text: "Failed to load data"/);
  assert.match(source, /noticeError\("Data failed permanently", error\.message\)/);
});

test("startup notices count registry graphics after both tasks settle", async () => {
  const source = await readAppFile("loadInitialData.js");

  assert.match(source, /getTotalGraphicsFromMap\(app\.map\)/);
});
