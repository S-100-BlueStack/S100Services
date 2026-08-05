import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../../..", import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("navbar exposes one compact data action without a permanent combined source row", async () => {
  const navbar = await readProjectFile("public/components/navbar.html");

  assert.match(navbar, /id="data-sources-button"/);
  assert.match(navbar, /icon="data"/);
  assert.match(navbar, /aria-label="Data sources"/);
  assert.match(navbar, /id="data-sources-button"[\s\S]*?hidden/);
  assert.doesNotMatch(navbar, /ENC Products|enc-products/);
});

test("local and global reset use the same controller-owned default restoration", async () => {
  const [panel, preferences] = await Promise.all([
    readProjectFile("src/features/dataSources/ui/dataSourcePanel.js"),
    readProjectFile("src/features/preferences/ui/preferencesPanel.js"),
  ]);

  assert.match(panel, /Reset to defaults/);
  assert.match(panel, /controller\.resetToDefaults\(\{[\s\S]*?data-source-panel-reset/);
  assert.match(
    preferences,
    /dataSourceController\?\.resetToDefaults\?\.\(\{[\s\S]*?preferences-reset/
  );
});

test("compatibility refresh replaces only the layer IDs returned by the compatibility loader", async () => {
  const [refreshService, rebuildLayers] = await Promise.all([
    readProjectFile("src/features/map/services/refreshService.js"),
    readProjectFile("src/features/map/core/rebuildLayers.js"),
  ]);

  assert.match(refreshService, /requestedLayerIds\.has\(layer\.customId\)/);
  assert.match(rebuildLayers, /targetLayerIds\.has\(layer\.customId\)/);
  assert.match(rebuildLayers, /clearLayers\(map, \{[\s\S]*?predicate:/);
});
