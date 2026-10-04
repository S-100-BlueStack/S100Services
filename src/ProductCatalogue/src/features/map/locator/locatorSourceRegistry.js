export const LOCATOR_CATEGORIES = Object.freeze(["Address", "Postal", "Populated Place"]);
export const LOCATOR_SOURCE_COUNTRIES = Object.freeze(["DNK", "GRL"]);

export const LOCATOR_SOURCE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "places",
    name: "Places",
    provider: "arcgis-world-geocoder",
    placeholder: "Find address or place",
    sourceCountries: LOCATOR_SOURCE_COUNTRIES,
    categories: LOCATOR_CATEGORIES,
    fallbackZoomScale: 25000,
    maxResults: 6,
    maxSuggestions: 6,
  }),
]);

export const LOCATOR_SEARCH_OPTIONS = Object.freeze({
  activeSourceIndex: 0,
  autoNavigateDisabled: false,
  autoSelectDisabled: false,
  includeDefaultSourcesDisabled: true,
  locationDisabled: true,
  popupDisabled: true,
  resultGraphicDisabled: true,
  searchAllDisabled: true,
  topLayerDisabled: true,
});

const LOCATOR_CONFIGURATION_ERROR =
  "Locator unavailable: VITE_ARCGIS_LOCATOR_URL is missing or invalid.";

export function createLocatorSourceRegistry({ env = import.meta.env } = {}) {
  const serviceUrl = normalizeLocatorServiceUrl(env?.VITE_ARCGIS_LOCATOR_URL);
  if (!serviceUrl) {
    return {
      available: false,
      serviceUrl: null,
      sourceDefinitions: [],
      searchOptions: LOCATOR_SEARCH_OPTIONS,
      unavailableReason: LOCATOR_CONFIGURATION_ERROR,
    };
  }

  return {
    available: true,
    serviceUrl,
    sourceDefinitions: LOCATOR_SOURCE_DEFINITIONS.map((definition) => ({
      ...definition,
      sourceCountries: [...definition.sourceCountries],
      categories: [...definition.categories],
    })),
    searchOptions: LOCATOR_SEARCH_OPTIONS,
    unavailableReason: "",
  };
}

export function normalizeLocatorServiceUrl(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!/\/GeocodeServer\/?$/i.test(url.pathname)) return null;

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
