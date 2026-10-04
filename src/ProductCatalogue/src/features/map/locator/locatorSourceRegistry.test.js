import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCATOR_CATEGORIES,
  LOCATOR_SEARCH_OPTIONS,
  LOCATOR_SOURCE_COUNTRIES,
  LOCATOR_SOURCE_DEFINITIONS,
  createLocatorSourceRegistry,
  normalizeLocatorServiceUrl,
} from "./locatorSourceRegistry.js";

const WORLD_GEOCODER_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

function createConfiguredRegistry(locatorUrl = WORLD_GEOCODER_URL) {
  return createLocatorSourceRegistry({
    env: {
      VITE_ARCGIS_LOCATOR_URL: locatorUrl,
    },
  });
}

test("registers exactly one initial logical geographic Locator source named Places", () => {
  const registry = createConfiguredRegistry();

  assert.equal(registry.available, true);
  assert.equal(registry.sourceDefinitions.length, 1);
  assert.equal(registry.sourceDefinitions[0].id, "places");
  assert.equal(registry.sourceDefinitions[0].name, "Places");
  assert.equal(registry.sourceDefinitions[0].provider, "arcgis-world-geocoder");
});

test("restricts Places to Denmark and Greenland and excludes Faroe Islands", () => {
  const registry = createConfiguredRegistry();
  const [source] = registry.sourceDefinitions;

  assert.deepEqual(LOCATOR_SOURCE_COUNTRIES, ["DNK", "GRL"]);
  assert.deepEqual(source.sourceCountries, ["DNK", "GRL"]);
  assert.equal(source.sourceCountries.includes("FRO"), false);
  assert.ok(source.sourceCountries.every(Boolean));
});

test("constrains Places to the approved World Geocoder categories", () => {
  const registry = createConfiguredRegistry();
  const [source] = registry.sourceDefinitions;

  assert.deepEqual(LOCATOR_CATEGORIES, ["Address", "Postal", "Populated Place"]);
  assert.deepEqual(source.categories, LOCATOR_CATEGORIES);
  assert.equal(source.categories.includes("POI"), false);
});

test("fails closed when locator configuration is missing, blank, or invalid", () => {
  const registries = [
    createLocatorSourceRegistry({ env: {} }),
    ...["", "   ", "not-a-url", "ftp://example.test/GeocodeServer"].map((locatorUrl) =>
      createConfiguredRegistry(locatorUrl)
    ),
  ];

  for (const registry of registries) {
    assert.equal(registry.available, false);
    assert.deepEqual(registry.sourceDefinitions, []);
    assert.match(registry.unavailableReason, /unavailable/i);
  }
});

test("accepts a configured HTTP(S) GeocodeServer URL without credentials, query, or fragment", () => {
  assert.equal(normalizeLocatorServiceUrl(WORLD_GEOCODER_URL), WORLD_GEOCODER_URL);
  assert.equal(
    normalizeLocatorServiceUrl(
      "https://enterprise.example.test/arcgis/rest/services/Locator/GeocodeServer/"
    ),
    "https://enterprise.example.test/arcgis/rest/services/Locator/GeocodeServer"
  );
  assert.equal(normalizeLocatorServiceUrl("https://user:secret@example.test/GeocodeServer"), null);
  assert.equal(normalizeLocatorServiceUrl("https://example.test/GeocodeServer?token=secret"), null);
});

test("configures a single explicit source with native first-result selection and navigation", () => {
  assert.equal(LOCATOR_SOURCE_DEFINITIONS.length, 1);
  assert.equal(LOCATOR_SEARCH_OPTIONS.includeDefaultSourcesDisabled, true);
  assert.equal(LOCATOR_SEARCH_OPTIONS.popupDisabled, true);
  assert.equal(LOCATOR_SEARCH_OPTIONS.resultGraphicDisabled, true);
  assert.equal(LOCATOR_SEARCH_OPTIONS.autoSelectDisabled, false);
  assert.equal(LOCATOR_SEARCH_OPTIONS.autoNavigateDisabled, false);
  assert.equal(LOCATOR_SEARCH_OPTIONS.activeSourceIndex, 0);
  assert.equal(LOCATOR_SEARCH_OPTIONS.searchAllDisabled, true);
});
