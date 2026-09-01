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
  assert.match(controller, /onSupported: \(\{ datasetName, identityKey \}\) => \{/);
  assert.match(controller, /feature: view\.popup\.selectedFeature/);
  assert.match(controller, /expectedDatasetName: btn\.dataset\.datasetName/);
  assert.match(controller, /expectedIdentityKey: btn\.dataset\.productIdentity/);
  assert.match(controller, /btn\.dataset\.productIdentity = identityKey;/);
  assert.match(controller, /hasProductCollectionProduct\(productIdentity\)/);
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

test("popup action bar fails closed through central Product context and action resolution", async () => {
  const [actionBar, actionConfig, collectionAction] = await Promise.all([
    readPopupFile("popupActionBar.js"),
    readPopupFile("popupActionConfig.js"),
    readPopupFile("popupHeaderCollectionAction.js"),
  ]);

  assert.match(
    actionBar,
    /import \{ resolveProductContext \} from "\.\.\/\.\.\/products\/domain\/productContext\.js";/
  );
  assert.match(actionBar, /const context = productContext \?\? resolveProductContext\(/);
  assert.match(actionBar, /if \(!context\) \{\s*return \[\];\s*\}/);
  assert.match(actionBar, /createPopupActionGroups\(\{[\s\S]*?productContext: context,/);
  assert.match(actionConfig, /createProductActionAvailability\(/);
  assert.match(actionConfig, /PRODUCT_OPERATION_CAPABILITY/);
  assert.doesNotMatch(
    actionBar,
    /attributesSupportLayerCapability|supportsPopupActions|supportsProductActions/
  );
  assert.doesNotMatch(actionBar, /paper-charts|s102-products|sourceId\s*===/);
  assert.doesNotMatch(actionConfig, /paper-charts|s102-products|sourceId\s*===/);
  assert.match(collectionAction, /PRODUCT_OPERATION_CAPABILITY\.PRODUCT_COLLECTION/);
  assert.match(collectionAction, /productContextSupportsCapability\(/);
  assert.match(collectionAction, /getProductContextIdentityKey\(/);
  assert.match(collectionAction, /expectedIdentityKey/);
  assert.doesNotMatch(collectionAction, /supportsPopupActions/);
});
