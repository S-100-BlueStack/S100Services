import assert from "node:assert/strict";
import test from "node:test";
import { createBasemapSettings, verifyProtectedBasemap } from "./basemapSettings.js";

test("protected style uses a class key until verification, then configures only Basemap Styles", async () => {
  const calls = [];
  const esriConfig = {
    apiKey: "unrelated-global-key",
    apiKeys: { basemapStyles: "previous-style-key", scopes: [] },
  };
  class FakeStyle {
    constructor(properties) {
      this.properties = properties;
      calls.push(["style", properties]);
    }
  }
  class FakeBasemap {
    constructor({ style }) {
      this.style = style;
      calls.push(["construct", esriConfig.apiKeys.basemapStyles]);
    }
    async load() {
      calls.push(["load", this.style.properties.apiKey]);
      assert.equal(esriConfig.apiKeys.basemapStyles, "previous-style-key");
    }
  }

  const verification = await verifyProtectedBasemap(" valid-style-key ", {
    loadModules: async () => [
      { default: esriConfig },
      { default: FakeBasemap },
      { default: FakeStyle },
    ],
  });

  assert.equal(esriConfig.apiKeys.basemapStyles, "previous-style-key");
  verification.activate();
  assert.deepEqual(calls, [
    ["style", { id: "arcgis/human-geography-dark", apiKey: "valid-style-key" }],
    ["construct", "previous-style-key"],
    ["load", "valid-style-key"],
  ]);
  assert.equal(esriConfig.apiKeys.basemapStyles, "valid-style-key");
  assert.equal(esriConfig.apiKey, "unrelated-global-key");
  assert.deepEqual(esriConfig.apiKeys.scopes, []);
});

test("protected basemap validation rejects missing credentials without loading the SDK", async () => {
  let imports = 0;
  await assert.rejects(
    verifyProtectedBasemap("  ", {
      loadModules: async () => {
        imports++;
        return [];
      },
    }),
    /Basemap Styles API key is required/
  );
  assert.equal(imports, 0);
});

test("settings verify protected access once with the normalized public browser key", async () => {
  const keys = [];
  const settings = createBasemapSettings({
    apiKey: "  valid-style-key ",
    storage: null,
    validateProtectedBasemap: async (key) => {
      keys.push(key);
      return true;
    },
  });
  try {
    settings.registerMap({});
    settings.registerMap({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(keys, ["valid-style-key"]);
    assert.equal(settings.getOptions().length, 4);
  } finally {
    settings.destroy();
  }
});

test("failed protected style verification never publishes an invalid global key", async () => {
  const esriConfig = { apiKeys: { basemapStyles: "previous-style-key" } };
  class FakeStyle {
    constructor({ id, apiKey }) {
      this.id = id;
      this.apiKey = apiKey;
    }
  }
  class FakeBasemap {
    constructor({ style }) {
      this.style = style;
    }
    async load() {
      assert.equal(this.style.apiKey, "invalid-key");
      assert.equal(esriConfig.apiKeys.basemapStyles, "previous-style-key");
      throw new Error("Denied");
    }
  }

  await assert.rejects(
    verifyProtectedBasemap("invalid-key", {
      loadModules: async () => [
        { default: esriConfig },
        { default: FakeBasemap },
        { default: FakeStyle },
      ],
    }),
    /Denied/
  );
  assert.equal(esriConfig.apiKeys.basemapStyles, "previous-style-key");
});

test("a verified key cannot be activated after the basemap settings are destroyed", async () => {
  let resolveValidation;
  let activated = false;
  const settings = createBasemapSettings({
    apiKey: "browser-key",
    storage: null,
    validateProtectedBasemap: () =>
      new Promise((resolve) => {
        resolveValidation = resolve;
      }),
  });
  settings.registerMap({});
  await new Promise((resolve) => setImmediate(resolve));
  settings.destroy();
  resolveValidation({ activate: () => (activated = true) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(activated, false);
});
