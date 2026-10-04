import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { DEFAULT_ARCGIS_PORTAL_URL, resolveArcGISPortalUrl } from "./arcgisPortalConfig.js";

const OLD_ORGANIZATION_PORTAL_URL = "https://nuvion.gst.dk/portal_guest";

for (const value of [undefined, null, "", "   ", 42]) {
  test(`uses neutral ArcGIS Online portal for missing or invalid type: ${JSON.stringify(value)}`, () => {
    assert.equal(resolveArcGISPortalUrl(value), DEFAULT_ARCGIS_PORTAL_URL);
  });
}

test("uses neutral ArcGIS Online portal as the repository default", () => {
  assert.equal(DEFAULT_ARCGIS_PORTAL_URL, "https://www.arcgis.com");
  assert.notEqual(DEFAULT_ARCGIS_PORTAL_URL, OLD_ORGANIZATION_PORTAL_URL);
});

for (const value of ["https://portal.example.org/arcgis", "http://localhost:7443/portal"]) {
  test(`accepts absolute HTTP(S) portal URL ${value}`, () => {
    assert.equal(resolveArcGISPortalUrl(value), value);
  });
}

test("trims a valid custom portal URL", () => {
  assert.equal(
    resolveArcGISPortalUrl("  https://portal.example.org/arcgis  "),
    "https://portal.example.org/arcgis"
  );
});

for (const value of [
  "https://",
  "http://[invalid",
  "https:portal.example.org/arcgis",
  "relative/path",
  "/portal",
  "//portal.example.org/arcgis",
  "javascript:alert(1)",
  "data:text/plain,portal",
  "file:///portal",
  "ftp://portal.example.org/arcgis",
  "https://user:password@portal.example.org/arcgis",
]) {
  test(`falls back for unsupported or malformed portal URL ${JSON.stringify(value)}`, () => {
    assert.equal(resolveArcGISPortalUrl(value), DEFAULT_ARCGIS_PORTAL_URL);
  });
}

test("keeps VITE_ARCGIS_PORTAL_URL read centralized in ArcGIS shared configuration", () => {
  const sourceRoot = new URL("../../", import.meta.url);
  const references = findSourceReferences(sourceRoot, "VITE_ARCGIS_PORTAL_URL");

  assert.deepEqual(references, ["shared/config/arcgisConfig.js"]);

  const arcgisConfig = readFileSync(new URL("./arcgisConfig.js", import.meta.url), "utf8");
  assert.match(arcgisConfig, /resolveArcGISPortalUrl\(env\?\.VITE_ARCGIS_PORTAL_URL\)/);
  assert.match(arcgisConfig, /esriConfig\.portalUrl\s*=\s*portalUrl/);
  assert.doesNotMatch(arcgisConfig, /nuvion\.gst\.dk/);
});

function findSourceReferences(rootUrl, searchText) {
  const results = [];
  walk(rootUrl, "", results, searchText);
  return results.sort();
}

function walk(directoryUrl, relativeDirectory, results, searchText) {
  for (const entry of readdirSync(directoryUrl, { withFileTypes: true })) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);

    if (entry.isDirectory()) {
      walk(entryUrl, relativePath, results, searchText);
      continue;
    }
    if (!entry.name.endsWith(".js") || entry.name.endsWith(".test.js")) {
      continue;
    }

    if (readFileSync(entryUrl, "utf8").includes(searchText)) {
      results.push(relativePath);
    }
  }
}
