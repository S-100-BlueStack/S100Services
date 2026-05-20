export const ATTRIBUTE_FILTER_CONFIG = {
  storageKey: "pm.attributeFilters.v1",

  global: {
    rangeFilterFields: new Set(["displayScale"]),

    defaultExcludedValues: [
      {
        fieldName: "status",
        values: ["1"],
      },
    ],
  },

  layers: {
    /*
    aoi: {
      rangeFilterFields: new Set(["displayScale"]),
      defaultExcludedValues: [
        {
          fieldName: "status",
          values: ["1"],
        },
      ],
    },
    */
  },
};
