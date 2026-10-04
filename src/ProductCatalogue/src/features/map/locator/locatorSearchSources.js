import Graphic from "@arcgis/core/Graphic.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import Point from "@arcgis/core/geometry/Point.js";
import esriRequest from "@arcgis/core/request.js";
import SearchSource from "@arcgis/core/widgets/Search/SearchSource.js";
import { createLocatorSourceRegistry } from "./locatorSourceRegistry.js";
import {
  createWorldGeocoderResultQuery,
  createWorldGeocoderSuggestionState,
  createWorldGeocoderSuggestQuery,
  getValidWorldGeocoderCandidates,
  getWorldGeocoderEndpoint,
  normalizeWorldGeocoderSuggestions,
  resolveWorldGeocoderResultInput,
} from "./locatorWorldGeocoder.js";

const LOCATOR_SOURCE_CREATION_ERROR =
  "Locator unavailable: the configured geographic search source could not be created.";

const LOCATOR_SOURCE_FACTORIES = Object.freeze({
  "arcgis-world-geocoder": createWorldGeocoderSearchSource,
});

export function createConfiguredLocatorSearchSources(options = {}) {
  const { request = esriRequest, ...registryOptions } = options;
  const registry = createLocatorSourceRegistry(registryOptions);
  if (!registry.available) {
    return {
      ...registry,
      sources: [],
      resetTransientState() {},
      navigationOptions: {},
    };
  }

  try {
    const preparedSources = registry.sourceDefinitions.map((definition) => {
      const createSource = LOCATOR_SOURCE_FACTORIES[definition.provider];
      if (!createSource) {
        throw new Error(`Unsupported Locator source provider: ${definition.provider}`);
      }

      return createSource({
        definition,
        serviceUrl: registry.serviceUrl,
        request,
      });
    });

    return {
      ...registry,
      sources: preparedSources.map((prepared) => prepared.source),
      resetTransientState: () => {
        for (const prepared of preparedSources) {
          prepared.resetTransientState?.();
        }
      },
      navigationOptions: {
        fallbackZoomScale: registry.sourceDefinitions[0]?.fallbackZoomScale,
      },
    };
  } catch (error) {
    console.warn("[Locator] Failed to create configured search source", error);
    return {
      ...registry,
      available: false,
      sources: [],
      resetTransientState() {},
      navigationOptions: {},
      unavailableReason: LOCATOR_SOURCE_CREATION_ERROR,
    };
  }
}

function createWorldGeocoderSearchSource({ definition, serviceUrl, request }) {
  const suggestionState = createWorldGeocoderSuggestionState();

  const requestSuggestions = async (suggestTerm, sourceIndex, requestOptions = {}) => {
    const response = await request(getWorldGeocoderEndpoint(serviceUrl, "suggest"), {
      query: createWorldGeocoderSuggestQuery(definition, {
        suggestTerm,
        maxSuggestions: definition.maxSuggestions,
      }),
      responseType: "json",
      signal: requestOptions.signal,
    });

    return normalizeWorldGeocoderSuggestions(response?.data?.suggestions, sourceIndex);
  };

  const source = new SearchSource({
    name: definition.name,
    autoNavigate: true,
    placeholder: definition.placeholder,
    maxResults: definition.maxResults,
    maxSuggestions: definition.maxSuggestions,
    popupEnabled: false,
    resultGraphicEnabled: false,
    suggestionsEnabled: true,
    withinViewEnabled: false,
    getSuggestions: async (params, requestOptions = {}) => {
      const token = suggestionState.begin(params.suggestTerm);
      const suggestions = await requestSuggestions(token.term, params.sourceIndex, requestOptions);

      // Search can issue overlapping suggestion requests. Only the newest term may
      // become the Enter fallback state; older responses still return to ArcGIS,
      // which owns their request lifecycle, but cannot replace our current state.
      suggestionState.publish(token, suggestions);
      return suggestions;
    },
    getResults: async (params, requestOptions = {}) => {
      const resolvedInput = await resolveWorldGeocoderResultInput({
        params,
        fallbackSearchTerm: suggestionState.getCurrentTerm(),
        suggestionState,
        fetchSuggestions: (searchTerm) =>
          requestSuggestions(searchTerm, params.sourceIndex, requestOptions),
      });

      const resultParams = {
        ...params,
        searchTerm: resolvedInput.searchTerm,
        suggestResult: resolvedInput.suggestResult ?? undefined,
      };

      const response = await request(
        getWorldGeocoderEndpoint(serviceUrl, "findAddressCandidates"),
        {
          query: createWorldGeocoderResultQuery(definition, resultParams, resolvedInput.searchTerm),
          responseType: "json",
          signal: requestOptions.signal,
        }
      );

      return normalizeSearchResults(
        response?.data,
        params.sourceIndex,
        resolvedInput.suggestResult?.key
      );
    },
  });

  return {
    source,
    resetTransientState: () => suggestionState.reset(),
  };
}

function normalizeSearchResults(data, sourceIndex, resultKey) {
  const candidates = getValidWorldGeocoderCandidates(data);
  const responseSpatialReference = data?.spatialReference ?? { wkid: 4326 };

  return candidates.map((candidate) => {
    const x = Number(candidate.location.x);
    const y = Number(candidate.location.y);
    const name = String(candidate.address).trim();
    const spatialReference = candidate.location?.spatialReference ?? responseSpatialReference;
    const feature = new Graphic({
      geometry: new Point({ x, y, spatialReference }),
      attributes: {
        ...(candidate.attributes ?? {}),
        MatchAddress: name,
        Score: candidate.score,
      },
    });
    const extent = createCandidateExtent(candidate.extent, spatialReference);

    return {
      name,
      feature,
      extent,
      key: resultKey,
      sourceIndex,
    };
  });
}

function createCandidateExtent(extent, fallbackSpatialReference) {
  if (!extent) return undefined;

  const xmin = Number(extent.xmin);
  const ymin = Number(extent.ymin);
  const xmax = Number(extent.xmax);
  const ymax = Number(extent.ymax);
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return undefined;

  return new Extent({
    xmin,
    ymin,
    xmax,
    ymax,
    spatialReference: extent.spatialReference ?? fallbackSpatialReference,
  });
}
