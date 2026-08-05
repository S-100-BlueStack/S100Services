import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const popupDirectory = new URL("./", import.meta.url);

async function readPopupFile(fileName) {
  return readFile(new URL(fileName, popupDirectory), "utf8");
}

test("popup header controller reconciles Product Collection through the central capability helper", async () => {
  const controller = await readPopupFile("popupHeaderController.js");

  assert.match(
    controller,
    /import \{[\s\S]*?mutatePopupHeaderCollection,[\s\S]*?reconcilePopupHeaderCollectionAction,[\s\S]*?\} from "\.\/popupHeaderCollectionAction\.js";/
  );
  assert.match(controller, /ensureCollectionButton\(header, feature, view\);/);
  assert.match(controller, /onUnsupported: \(\) => removeCollectionButton\(header\)/);
  assert.match(controller, /feature: view\.popup\.selectedFeature/);
  assert.match(controller, /if \(!result\.handled\) \{[\s\S]*?removeCollectionButton\(header\);/);
  assert.doesNotMatch(controller, /paper-charts|s102-products|sourceId\s*===/);
});

test("Copy dataset name remains independent from Product Collection capability", async () => {
  const controller = await readPopupFile("popupHeaderController.js");

  assert.match(
    controller,
    /ensureCollectionButton\(header, feature, view\);\s*ensureCopyButton\(header, attr\.datasetName\);/
  );
  assert.match(controller, /btn\.title = "Copy dataset name";/);
});

test("popup action bar still fails closed through central Product action capability resolution", async () => {
  const actionBar = await readPopupFile("popupActionBar.js");

  assert.match(
    actionBar,
    /attributesSupportLayerCapability\(attributes, "supportsProductActions"\)/
  );
  assert.doesNotMatch(actionBar, /paper-charts|s102-products|sourceId\s*===/);
});
