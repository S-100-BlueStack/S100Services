export const ATTRIBUTE_FILTER_FIELD_DEFINITIONS = Object.freeze([
  Object.freeze({
    fieldName: "displayScale",
    label: "Display scale",
    mode: "range",
    aliases: Object.freeze(["displayScale", "DisplayScale"]),
  }),
  Object.freeze({
    fieldName: "status",
    label: "Status",
    mode: "values",
    optionSource: "productStates",
    aliases: Object.freeze(["status", "Status"]),
  }),
  Object.freeze({
    fieldName: "usageBand",
    label: "Usage band",
    mode: "values",
    aliases: Object.freeze(["usageBand", "UsageBand"]),
  }),
]);

export const ATTRIBUTE_FILTER_CONFIG = {
  storageKey: "pc.attributeFilters.v3",

  global: {
    rangeFilterFields: new Set(["displayScale"]),

    defaultExcludedValues: [
      {
        fieldName: "status",
        values: ["1"],
      },
    ],
  },

  layers: {},
};

const definitionsByKey = new Map(
  ATTRIBUTE_FILTER_FIELD_DEFINITIONS.map((definition) => [
    normalizeAttributeFilterFieldKey(definition.fieldName),
    definition,
  ])
);

for (const definition of ATTRIBUTE_FILTER_FIELD_DEFINITIONS) {
  for (const alias of definition.aliases ?? []) {
    definitionsByKey.set(normalizeAttributeFilterFieldKey(alias), definition);
  }
}

export function getAttributeFilterFieldDefinitions() {
  return ATTRIBUTE_FILTER_FIELD_DEFINITIONS;
}

export function getAttributeFilterFieldDefinition(fieldName) {
  return definitionsByKey.get(normalizeAttributeFilterFieldKey(fieldName)) ?? null;
}

export function getCanonicalAttributeFilterFieldName(fieldName) {
  return getAttributeFilterFieldDefinition(fieldName)?.fieldName ?? null;
}

export function getAttributeFilterFieldLabel(fieldName) {
  return getAttributeFilterFieldDefinition(fieldName)?.label ?? String(fieldName ?? "");
}

export function isConfiguredAttributeFilterField(fieldName) {
  return Boolean(getAttributeFilterFieldDefinition(fieldName));
}

export function normalizeAttributeFilterFieldKey(fieldName) {
  return String(fieldName ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}
