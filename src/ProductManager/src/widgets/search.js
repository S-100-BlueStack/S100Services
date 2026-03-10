import Search from "@arcgis/core/widgets/Search.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

export function createSearchBar(view) {
  return new Search({
    view: view,
    allPlaceholder: "Gå til produkt",
    locationEnabled: false,
    includeDefaultSources: false,
    sources: [
      {
        layer: new FeatureLayer({
          url: "https://nuvion.gst.dk/arcgis/rest/services/cockpit_gst_dk/ProductCatalogSearch_v4/FeatureServer/0", // AoI
          outFields: ["PRODUCTIDENTIFIER", "CATEGORYOFCOVERAGE"],
        }),
        searchFields: ["PRODUCTIDENTIFIER"],
        displayField: "PRODUCTIDENTIFIER",
        exactMatch: true,
        popupEnabled: true,
        popupTemplate: {
          title: "{PRODUCTIDENTIFIER}",
        },
        maxSuggestions: 12,
        suggestionsEnabled: true,
        name: "Produkter",
        placeholder: "Gå til produkt",
        outFields: ["PRODUCTIDENTIFIER", "CATEGORYOFCOVERAGE"],
        filter: { where: "CATEGORYOFCOVERAGE = 1" },
      },
      {
        layer: new FeatureLayer({
          url: "https://nuvion.gst.dk/arcgis/rest/services/cockpit_gst_dk/ProductCatalogSearch_v4/FeatureServer/1", // PoI
          outFields: ["PRODUCTIDENTIFIER"],
        }),
        searchFields: ["PRODUCTIDENTIFIER"],
        displayField: "PRODUCTIDENTIFIER",
        suggestionsEnabled: true,
        popupEnabled: true,
        popupTemplate: {
          title: "{PRODUCTIDENTIFIER}",
          dockEnabled: false,
        },
        maxSuggestions: 12,
        name: "Havne og broer",
        placeholder: "Gå til havne/broer",
        outFields: ["PRODUCTIDENTIFIER"],
        exactMatch: true,
      },
      {
        layer: new FeatureLayer({
          url: "https://nuvion.gst.dk/arcgis/rest/services/cockpit_gst_dk/ProductCatalogSearch_v4/FeatureServer/0", // AoI
          outFields: ["GlobalID", "CATEGORYOFCOVERAGE", "PRODUCTIDENTIFIER"],
        }),
        searchFields: ["GlobalID"],
        displayField: "PRODUCTIDENTIFIER",
        exactMatch: true,
        popupEnabled: true,
        popupTemplate: {
          title: "{PRODUCTIDENTIFIER}",
        },
        maxSuggestions: 12,
        suggestionsEnabled: true,
        name: "ENCs",
        placeholder: "Gå til produkt",
        outFields: ["PRODUCTIDENTIFIER", "GlobalID", "CATEGORYOFCOVERAGE"],
        filter: { where: "CATEGORYOFCOVERAGE = 1" },
      },
    ],
    goToOverride: function (view, goToParams) {
      goToParams.options = {
        duration: 1000,
      };
      return view.goTo(goToParams.target, goToParams.options);
    },
  });
}
