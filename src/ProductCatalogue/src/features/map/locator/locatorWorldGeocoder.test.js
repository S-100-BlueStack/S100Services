import assert from "node:assert/strict";
import test from "node:test";

import { LOCATOR_SOURCE_DEFINITIONS } from "./locatorSourceRegistry.js";
import {
  createWorldGeocoderResultQuery,
  createWorldGeocoderScope,
  createWorldGeocoderSuggestionState,
  createWorldGeocoderSuggestQuery,
  getValidWorldGeocoderCandidates,
  getWorldGeocoderEndpoint,
  isExplicitWorldGeocoderSuggestion,
  normalizeWorldGeocoderSuggestions,
  resolveWorldGeocoderResultInput,
  resolveWorldGeocoderResultSearchTerm,
} from "./locatorWorldGeocoder.js";

const [PLACES_SOURCE] = LOCATOR_SOURCE_DEFINITIONS;
const WORLD_GEOCODER_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

const BYGADEN_SUGGESTIONS = [
  {
    text: "Bygaden 57E, 4040 Jyllinge",
    magicKey: "first-magic-key",
  },
  {
    text: "Bygaden 57E, 4360 Kirke Eskilstrup",
    magicKey: "second-magic-key",
  },
];

test("builds one strict DNK+GRL World Geocoder scope without Faroe Islands", () => {
  const scope = createWorldGeocoderScope(PLACES_SOURCE);

  assert.deepEqual(scope, {
    sourceCountry: "DNK,GRL",
    category: "Address,Postal,Populated Place",
  });
  assert.equal(scope.sourceCountry.includes("FRO"), false);
});

test("applies identical geographic and category restrictions to suggest and result requests", () => {
  const suggestQuery = createWorldGeocoderSuggestQuery(PLACES_SOURCE, {
    suggestTerm: "Aalborg",
    maxSuggestions: 4,
  });
  const resultQuery = createWorldGeocoderResultQuery(PLACES_SOURCE, {
    suggestResult: { text: "Aalborg, Denmark", key: "magic-key" },
    maxResults: 5,
  });

  assert.equal(suggestQuery.sourceCountry, resultQuery.sourceCountry);
  assert.equal(suggestQuery.category, resultQuery.category);
  assert.equal(suggestQuery.sourceCountry, "DNK,GRL");
  assert.equal(suggestQuery.category, "Address,Postal,Populated Place");
  assert.equal(suggestQuery.text, "Aalborg");
  assert.equal(resultQuery.SingleLine, "Aalborg, Denmark");
  assert.equal(resultQuery.magicKey, "magic-key");
  assert.equal(resultQuery.forStorage, false);
});

test("normalizes World Geocoder suggestions without inventing magic keys", () => {
  const suggestions = normalizeWorldGeocoderSuggestions(
    [...BYGADEN_SUGGESTIONS, { text: "  Nuuk  " }, { text: "" }],
    0
  );

  assert.deepEqual(suggestions, [
    {
      text: "Bygaden 57E, 4040 Jyllinge",
      key: "first-magic-key",
      sourceIndex: 0,
    },
    {
      text: "Bygaden 57E, 4360 Kirke Eskilstrup",
      key: "second-magic-key",
      sourceIndex: 0,
    },
    { text: "Nuuk", sourceIndex: 0 },
  ]);
});

test("recognizes only keyed service suggestions as explicit selections", () => {
  assert.equal(
    isExplicitWorldGeocoderSuggestion({
      text: "Bygaden 57E, 4040 Jyllinge",
      key: "magic-key",
    }),
    true
  );
  assert.equal(isExplicitWorldGeocoderSuggestion({ text: "Bygaden 57E" }), false);
  assert.equal(isExplicitWorldGeocoderSuggestion({ key: "magic-key" }), false);
});

test("keeps an explicitly selected suggestion ahead of cached first suggestions", async () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  const token = suggestionState.begin("Bygaden 57E");
  suggestionState.publish(token, normalizeWorldGeocoderSuggestions(BYGADEN_SUGGESTIONS, 0));

  let fetched = false;
  const selected = {
    text: "Bygaden 57E, 4360 Kirke Eskilstrup",
    key: "selected-magic-key",
    sourceIndex: 0,
  };
  const resolved = await resolveWorldGeocoderResultInput({
    params: { suggestResult: selected },
    fallbackSearchTerm: suggestionState.getCurrentTerm(),
    suggestionState,
    fetchSuggestions: async () => {
      fetched = true;
      return [];
    },
  });

  assert.equal(resolved.mode, "selected-suggestion");
  assert.equal(resolved.suggestResult, selected);
  assert.equal(fetched, false);
});

test("Enter with a raw unkeyed Search suggestResult resolves the first current service suggestion", async () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  const token = suggestionState.begin("Bygaden 57E");
  suggestionState.publish(token, normalizeWorldGeocoderSuggestions(BYGADEN_SUGGESTIONS, 0));

  const resolved = await resolveWorldGeocoderResultInput({
    params: { suggestResult: { text: "Bygaden 57E" } },
    fallbackSearchTerm: suggestionState.getCurrentTerm(),
    suggestionState,
  });

  assert.equal(resolved.mode, "first-suggestion");
  assert.equal(resolved.searchTerm, "Bygaden 57E");
  assert.deepEqual(resolved.suggestResult, {
    text: "Bygaden 57E, 4040 Jyllinge",
    key: "first-magic-key",
    sourceIndex: 0,
  });

  const resultQuery = createWorldGeocoderResultQuery(
    PLACES_SOURCE,
    {
      suggestResult: resolved.suggestResult,
      searchTerm: resolved.searchTerm,
    },
    resolved.searchTerm
  );
  assert.equal(resultQuery.SingleLine, "Bygaden 57E, 4040 Jyllinge");
  assert.equal(resultQuery.magicKey, "first-magic-key");
  assert.equal(resultQuery.sourceCountry, "DNK,GRL");
  assert.equal(resultQuery.category, "Address,Postal,Populated Place");
});

test("fast Enter fetches scoped suggestions and resolves their first keyed result", async () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  suggestionState.begin("Bygaden 57E");
  let fetchedTerm = null;

  const resolved = await resolveWorldGeocoderResultInput({
    params: { suggestResult: { text: "Bygaden 57E" } },
    fallbackSearchTerm: suggestionState.getCurrentTerm(),
    suggestionState,
    fetchSuggestions: async (searchTerm) => {
      fetchedTerm = searchTerm;
      return normalizeWorldGeocoderSuggestions(BYGADEN_SUGGESTIONS, 0);
    },
  });

  assert.equal(fetchedTerm, "Bygaden 57E");
  assert.equal(resolved.mode, "first-suggestion");
  assert.equal(resolved.suggestResult.key, "first-magic-key");
  assert.equal(resolved.suggestResult.text, "Bygaden 57E, 4040 Jyllinge");
});

test("stale suggestion responses cannot replace state for a newer term", () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  const oldToken = suggestionState.begin("Bygaden 57E");
  const newToken = suggestionState.begin("Aalborg");

  const newSuggestions = normalizeWorldGeocoderSuggestions(
    [{ text: "Aalborg, Denmark", magicKey: "aalborg-key" }],
    0
  );
  const oldSuggestions = normalizeWorldGeocoderSuggestions(BYGADEN_SUGGESTIONS, 0);

  assert.equal(suggestionState.publish(newToken, newSuggestions), true);
  assert.equal(suggestionState.publish(oldToken, oldSuggestions), false);
  assert.equal(suggestionState.getFirst("Bygaden 57E"), null);
  assert.deepEqual(suggestionState.getFirst("Aalborg"), {
    text: "Aalborg, Denmark",
    key: "aalborg-key",
    sourceIndex: 0,
  });
});

test("falls back to scoped direct geocoding only when no keyed suggestion is available", async () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  suggestionState.begin("Bygaden 57E");

  const resolved = await resolveWorldGeocoderResultInput({
    params: { suggestResult: { text: "Bygaden 57E" } },
    fallbackSearchTerm: suggestionState.getCurrentTerm(),
    suggestionState,
    fetchSuggestions: async () => [],
  });

  assert.equal(resolved.mode, "direct");
  assert.equal(resolved.searchTerm, "Bygaden 57E");
  assert.equal(resolved.suggestResult, null);

  const query = createWorldGeocoderResultQuery(
    PLACES_SOURCE,
    { searchTerm: resolved.searchTerm },
    resolved.searchTerm
  );
  assert.equal(query.SingleLine, "Bygaden 57E");
  assert.equal(Object.hasOwn(query, "magicKey"), false);
  assert.equal(query.sourceCountry, "DNK,GRL");
  assert.equal(query.category, "Address,Postal,Populated Place");
});

test("uses an explicit public searchTerm when supplied and otherwise falls back to typed text", () => {
  assert.equal(
    resolveWorldGeocoderResultSearchTerm({ searchTerm: "Nuuk" }, "stale fallback"),
    "Nuuk"
  );
  assert.equal(
    resolveWorldGeocoderResultSearchTerm({ suggestResult: { text: "Sisimiut" } }, "stale fallback"),
    "Sisimiut"
  );
  assert.equal(resolveWorldGeocoderResultSearchTerm({}, "Sisimiut"), "Sisimiut");
});

test("keeps valid candidate order so ArcGIS can auto-select the first valid result", () => {
  const validCandidates = getValidWorldGeocoderCandidates({
    candidates: [
      { address: "", location: { x: 12.1, y: 55.1 } },
      { address: "Bygaden 57E", location: { x: 12.593, y: 55.673 } },
      { address: "Bygaden 57F", location: { x: 12.594, y: 55.674 } },
    ],
  });

  assert.deepEqual(
    validCandidates.map((candidate) => candidate.address),
    ["Bygaden 57E", "Bygaden 57F"]
  );
});

test("builds only configured World Geocoder operation endpoints", () => {
  assert.equal(
    getWorldGeocoderEndpoint(WORLD_GEOCODER_URL, "suggest"),
    `${WORLD_GEOCODER_URL}/suggest`
  );
  assert.equal(
    getWorldGeocoderEndpoint(WORLD_GEOCODER_URL, "findAddressCandidates"),
    `${WORLD_GEOCODER_URL}/findAddressCandidates`
  );
});

test("completed provider state can be retired without leaking its first suggestion", () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  const token = suggestionState.begin("Bygaden 57E");
  suggestionState.publish(token, normalizeWorldGeocoderSuggestions(BYGADEN_SUGGESTIONS, 0));

  assert.equal(suggestionState.getFirst("Bygaden 57E")?.key, "first-magic-key");

  suggestionState.reset();

  assert.equal(suggestionState.getCurrentTerm(), "");
  assert.equal(suggestionState.getFirst("Bygaden 57E"), null);
});

test("retiring provider state invalidates late publishes from the completed search", () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  const completedToken = suggestionState.begin("Bygaden 57E");

  suggestionState.reset();

  assert.equal(
    suggestionState.publish(
      completedToken,
      normalizeWorldGeocoderSuggestions(BYGADEN_SUGGESTIONS, 0)
    ),
    false
  );
  assert.equal(suggestionState.getFirst("Bygaden 57E"), null);
});

test("a new search cannot consume the retired first suggestion from the previous search", async () => {
  const suggestionState = createWorldGeocoderSuggestionState();
  const oldToken = suggestionState.begin("Bygaden 57E");
  suggestionState.publish(oldToken, normalizeWorldGeocoderSuggestions(BYGADEN_SUGGESTIONS, 0));
  suggestionState.reset();

  const newToken = suggestionState.begin("Nuuk");
  suggestionState.publish(
    newToken,
    normalizeWorldGeocoderSuggestions([{ text: "Nuuk, Greenland", magicKey: "nuuk-magic-key" }], 0)
  );

  const resolved = await resolveWorldGeocoderResultInput({
    params: { suggestResult: { text: "Nuuk" } },
    fallbackSearchTerm: suggestionState.getCurrentTerm(),
    suggestionState,
  });

  assert.equal(resolved.searchTerm, "Nuuk");
  assert.equal(resolved.suggestResult?.key, "nuuk-magic-key");
  assert.notEqual(resolved.suggestResult?.key, "first-magic-key");
});
