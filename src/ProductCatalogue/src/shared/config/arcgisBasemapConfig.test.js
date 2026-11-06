import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readArcGISBasemapApiKey } from "./arcgisBasemapConfig.js";

test("ArcGIS basemap key is an optional trimmed build-time string", () => {
  assert.equal(readArcGISBasemapApiKey({ VITE_ARCGIS_BASEMAP_API_KEY: "  " }), "");
  assert.equal(readArcGISBasemapApiKey({ VITE_ARCGIS_BASEMAP_API_KEY: 42 }), "");
  assert.equal(
    readArcGISBasemapApiKey({ VITE_ARCGIS_BASEMAP_API_KEY: "  test-key  " }),
    "test-key"
  );
});

test("ArcGIS configuration scopes the key to basemap styles instead of private APIs", async () => {
  const config = { apiKeys: {}, apiKey: undefined };
  globalThis.__basemapTestConfig = config;
  try {
    const source = (await readFile(new URL("./arcgisConfig.js", import.meta.url), "utf8"))
      .replace(
        'import esriConfig from "@arcgis/core/config.js";',
        "const esriConfig = globalThis.__basemapTestConfig;"
      )
      .replaceAll(
        'from "./arcgisPortalConfig.js"',
        `from "${new URL("./arcgisPortalConfig.js", import.meta.url).href}"`
      )
      .replaceAll(
        'from "./arcgisBasemapConfig.js"',
        `from "${new URL("./arcgisBasemapConfig.js", import.meta.url).href}"`
      );
    const { configureArcGIS } = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    configureArcGIS({ env: { VITE_ARCGIS_BASEMAP_API_KEY: "  example-key  " } });
    assert.equal(config.apiKeys.basemapStyles, "example-key");
    assert.equal(config.apiKey, undefined);
    assert.equal(config.apiKeys.scopes, undefined);
    assert.equal(config.portalUrl, "https://www.arcgis.com");
  } finally {
    delete globalThis.__basemapTestConfig;
  }
});
