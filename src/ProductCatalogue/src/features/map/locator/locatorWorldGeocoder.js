export function createWorldGeocoderScope(definition) {
  return {
    sourceCountry: definition.sourceCountries.join(","),
    category: definition.categories.join(","),
  };
}

export function createWorldGeocoderSuggestQuery(definition, params = {}) {
  return {
    f: "json",
    text: normalizeSearchTerm(params.suggestTerm),
    maxSuggestions: normalizePositiveLimit(params.maxSuggestions, definition.maxSuggestions),
    ...createWorldGeocoderScope(definition),
  };
}

export function createWorldGeocoderResultQuery(definition, params = {}, fallbackSearchTerm = "") {
  const suggestResult = params.suggestResult ?? {};
  const query = {
    f: "json",
    SingleLine: resolveWorldGeocoderResultSearchTerm(params, fallbackSearchTerm),
    maxLocations: normalizePositiveLimit(params.maxResults, definition.maxResults),
    forStorage: false,
    outFields: "*",
    ...createWorldGeocoderScope(definition),
  };

  const magicKey = normalizeSearchTerm(suggestResult.key);
  if (magicKey) query.magicKey = magicKey;

  return query;
}

export function resolveWorldGeocoderResultSearchTerm(params = {}, fallbackSearchTerm = "") {
  if (isExplicitWorldGeocoderSuggestion(params.suggestResult)) {
    return normalizeSearchTerm(params.suggestResult.text);
  }

  const directSearchTerm = normalizeSearchTerm(params.searchTerm);
  if (directSearchTerm) return directSearchTerm;

  const suggestionText = normalizeSearchTerm(params.suggestResult?.text);
  if (suggestionText) return suggestionText;

  return normalizeSearchTerm(fallbackSearchTerm);
}

export function isExplicitWorldGeocoderSuggestion(suggestResult) {
  return Boolean(
    normalizeSearchTerm(suggestResult?.text) && normalizeSearchTerm(suggestResult?.key)
  );
}

export function normalizeWorldGeocoderSuggestions(suggestions, sourceIndex) {
  if (!Array.isArray(suggestions)) return [];

  return suggestions
    .map((suggestion) => {
      const text = normalizeSearchTerm(suggestion?.text);
      const key = normalizeSearchTerm(suggestion?.magicKey ?? suggestion?.key);
      if (!text) return null;

      return {
        text,
        ...(key ? { key } : {}),
        sourceIndex,
      };
    })
    .filter(Boolean);
}

export function createWorldGeocoderSuggestionState() {
  let generation = 0;
  let currentTerm = "";
  let currentSuggestions = [];

  return {
    begin(term) {
      generation += 1;
      currentTerm = normalizeSearchTerm(term);
      currentSuggestions = [];

      return {
        generation,
        term: currentTerm,
      };
    },
    publish(token, suggestions) {
      if (!token || token.generation !== generation || token.term !== currentTerm) {
        return false;
      }

      currentSuggestions = Array.isArray(suggestions) ? [...suggestions] : [];
      return true;
    },
    getFirst(term) {
      const normalizedTerm = normalizeSearchTerm(term);
      if (!normalizedTerm || normalizedTerm !== currentTerm) return null;
      return currentSuggestions[0] ?? null;
    },
    getCurrentTerm() {
      return currentTerm;
    },
    reset() {
      // Incrementing the generation also prevents an in-flight response from
      // repopulating state after a completed search or closed Locator session.
      generation += 1;
      currentTerm = "";
      currentSuggestions = [];
    },
  };
}

export async function resolveWorldGeocoderResultInput({
  params = {},
  fallbackSearchTerm = "",
  suggestionState,
  fetchSuggestions,
} = {}) {
  if (isExplicitWorldGeocoderSuggestion(params.suggestResult)) {
    return {
      mode: "selected-suggestion",
      searchTerm: normalizeSearchTerm(params.suggestResult.text),
      suggestResult: params.suggestResult,
    };
  }

  const searchTerm = resolveWorldGeocoderResultSearchTerm(params, fallbackSearchTerm);
  if (!searchTerm) {
    return {
      mode: "direct",
      searchTerm: "",
      suggestResult: null,
    };
  }

  const cachedSuggestion = suggestionState?.getFirst?.(searchTerm);
  if (isExplicitWorldGeocoderSuggestion(cachedSuggestion)) {
    return {
      mode: "first-suggestion",
      searchTerm,
      suggestResult: cachedSuggestion,
    };
  }

  const fetchedSuggestions =
    typeof fetchSuggestions === "function" ? await fetchSuggestions(searchTerm) : [];
  const firstValidSuggestion = Array.isArray(fetchedSuggestions)
    ? fetchedSuggestions.find(isExplicitWorldGeocoderSuggestion)
    : null;

  if (firstValidSuggestion) {
    return {
      mode: "first-suggestion",
      searchTerm,
      suggestResult: firstValidSuggestion,
    };
  }

  return {
    mode: "direct",
    searchTerm,
    suggestResult: null,
  };
}

export function getValidWorldGeocoderCandidates(data) {
  if (!Array.isArray(data?.candidates)) return [];

  return data.candidates.filter((candidate) => {
    const x = Number(candidate?.location?.x);
    const y = Number(candidate?.location?.y);
    const name = normalizeSearchTerm(candidate?.address);
    return Boolean(name) && Number.isFinite(x) && Number.isFinite(y);
  });
}

export function getWorldGeocoderEndpoint(serviceUrl, operation) {
  return `${String(serviceUrl).replace(/\/$/, "")}/${operation}`;
}

export function normalizeWorldGeocoderSearchTerm(value) {
  return normalizeSearchTerm(value);
}

function normalizeSearchTerm(value) {
  return String(value ?? "").trim();
}

function normalizePositiveLimit(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallback;
}
