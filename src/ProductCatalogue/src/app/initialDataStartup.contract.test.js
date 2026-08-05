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
  assert.match(
    source,
    /runInitialDataStartup\(\{[\s\S]*?loadCompatibilityData: \(\) => loadCompatibilityAoiData\(app, loaderProgress\),[\s\S]*?initializeRuntimeSources: \(\) => app\.dataSourceController\?\.initialize\?\.\(\)/
  );
  assert.doesNotMatch(
    source,
    /await loadCompatibilityAoiData\([\s\S]*?await app\.dataSourceController\?\.initialize/
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

test("compatibility notices prefer the AOI render summary over the shared map", async () => {
  const source = await readAppFile("loadInitialData.js");

  assert.match(
    source,
    /getTotalGraphicsFromRenderSummary\(renderSummary\) \?\? getTotalGraphicsFromMap\(app\.map\)/
  );
});
