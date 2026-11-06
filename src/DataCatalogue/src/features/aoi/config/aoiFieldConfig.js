export const AOI_FIELD = Object.freeze({
  OBJECT_ID: "OBJECTID",
  GEOMETRY: "Shape",
  DISPLAY_NAME: "PRODUCTNAME",
  SERIES: "SERIES",
  EDITION: "EDITION",
  LOCKED: "LOCKED",
  FILE_LINK: "FILELINK",
  JSON: "JSON",
  ISSUE_DATE: "ISSUEDATE",
  IS_TECHNICAL: "IS_TECHNICAL",
  UPDATE_TYPE: "UPDT",
  PRODUCT_ID: "PRODUCTID",
  GLOBAL_ID: "GlobalID",
  CREATED_USER: "created_user",
  CREATED_DATE: "created_date",
  LAST_EDITED_USER: "last_edited_user",
  LAST_EDITED_DATE: "last_edited_date",
});

export const AOI_TEST_FIELD_CONFIG = Object.freeze({
  idField: AOI_FIELD.GLOBAL_ID,
  objectIdField: AOI_FIELD.OBJECT_ID,
  displayNameField: AOI_FIELD.DISPLAY_NAME,
  productIdField: AOI_FIELD.PRODUCT_ID,
  secondaryDisplayFields: Object.freeze([AOI_FIELD.SERIES, AOI_FIELD.EDITION]),
});

export const AOI_ID_FIELD_CANDIDATES = Object.freeze([
  AOI_FIELD.GLOBAL_ID,
  "globalId",
  "globalID",
  AOI_FIELD.PRODUCT_ID,
  "productId",
  "id",
  "aoiId",
  "aoi_id",
]);

export const AOI_NAME_FIELD_CANDIDATES = Object.freeze([
  AOI_FIELD.DISPLAY_NAME,
  "productName",
  "name",
  "Name",
  "title",
  "Title",
  "aoiName",
  "aoi_name",
]);

export const AOI_REQUIRED_FIELD_INFOS = Object.freeze([
  Object.freeze({
    fieldName: AOI_FIELD.GLOBAL_ID,
    label: "Global ID",
    reason: "AOI-to-Job relations currently use GlobalID as the provisional AOI id.",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.DISPLAY_NAME,
    label: "Product name",
    reason: "AOI popup and selected AOI UI need a readable display name.",
  }),
]);

export const AOI_RECOMMENDED_FIELD_INFOS = Object.freeze([
  Object.freeze({
    fieldName: AOI_FIELD.OBJECT_ID,
    label: "Object ID",
    reason: "ArcGIS popup, highlight and diagnostics are easier to verify with OBJECTID available.",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.PRODUCT_ID,
    label: "Product ID",
    reason: "Product ID may become relevant for backend/domain matching later.",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.SERIES,
    label: "Series",
    reason: "Series helps users distinguish AOIs with similar product names.",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.EDITION,
    label: "Edition",
    reason: "Edition helps users distinguish AOIs with similar product names.",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.ISSUE_DATE,
    label: "Issue date",
    reason: "Issue date is useful AOI metadata in the popup.",
  }),
]);

const AOI_POPUP_FIELD_INFOS = Object.freeze([
  Object.freeze({
    fieldName: AOI_FIELD.DISPLAY_NAME,
    label: "Product name",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.SERIES,
    label: "Series",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.EDITION,
    label: "Edition",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.ISSUE_DATE,
    label: "Issue date",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.PRODUCT_ID,
    label: "Product ID",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.GLOBAL_ID,
    label: "Global ID",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.OBJECT_ID,
    label: "Object ID",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.LOCKED,
    label: "Locked",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.IS_TECHNICAL,
    label: "Technical",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.UPDATE_TYPE,
    label: "Update type",
  }),
]);

export function createAoiOutFields() {
  // The AOI service contract is still provisional, so request all fields and
  // use validation/popup filtering to avoid breaking on optional field changes.
  return ["*"];
}

export function createAoiPopupTemplate({ availableFieldNames } = {}) {
  const fieldInfos = createAoiPopupFieldInfos({ availableFieldNames });

  return {
    title: createAoiPopupTitle({ availableFieldNames }),
    content:
      fieldInfos.length > 0
        ? [
            {
              type: "fields",
              fieldInfos,
            },
          ]
        : [
            {
              type: "text",
              text: "AOI metadata is unavailable.",
            },
          ],
  };
}

export function createAoiPopupFieldInfos({ availableFieldNames } = {}) {
  const availableFieldNameSet = createAvailableFieldNameSet(availableFieldNames);

  return AOI_POPUP_FIELD_INFOS.filter((fieldInfo) =>
    isFieldAvailable(fieldInfo.fieldName, availableFieldNameSet)
  ).map((fieldInfo) => ({ ...fieldInfo }));
}

export function createAoiFieldValidationReport(
  fields,
  { objectIdField = "", geometryType = "" } = {}
) {
  const availableFieldNames = getAoiFieldNames(fields);
  const availableFieldNameSet = createAvailableFieldNameSet(availableFieldNames);
  const missingRequiredFields = getMissingFields(AOI_REQUIRED_FIELD_INFOS, availableFieldNameSet);
  const missingRecommendedFields = getMissingFields(
    AOI_RECOMMENDED_FIELD_INFOS,
    availableFieldNameSet
  );
  const warnings = [
    ...createMissingFieldWarnings("required", missingRequiredFields),
    ...createMissingFieldWarnings("recommended", missingRecommendedFields),
  ];

  return {
    availableFieldNames,
    missingRequiredFields,
    missingRecommendedFields,
    hasRequiredFields: missingRequiredFields.length === 0,
    objectIdField: normalizeOptionalString(objectIdField),
    geometryType: normalizeOptionalString(geometryType),
    warnings,
  };
}

export function getAoiFieldNames(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return [
    ...new Set(
      fields.map((field) => normalizeOptionalString(field?.name ?? field)).filter(Boolean)
    ),
  ];
}

function createAoiPopupTitle({ availableFieldNames } = {}) {
  const availableFieldNameSet = createAvailableFieldNameSet(availableFieldNames);

  if (isFieldAvailable(AOI_FIELD.DISPLAY_NAME, availableFieldNameSet)) {
    return `{${AOI_FIELD.DISPLAY_NAME}}`;
  }

  if (isFieldAvailable(AOI_FIELD.GLOBAL_ID, availableFieldNameSet)) {
    return `{${AOI_FIELD.GLOBAL_ID}}`;
  }

  if (isFieldAvailable(AOI_FIELD.PRODUCT_ID, availableFieldNameSet)) {
    return `{${AOI_FIELD.PRODUCT_ID}}`;
  }

  if (isFieldAvailable(AOI_FIELD.OBJECT_ID, availableFieldNameSet)) {
    return `AOI {${AOI_FIELD.OBJECT_ID}}`;
  }

  return "Area of Interest";
}

function getMissingFields(fieldInfos, availableFieldNameSet) {
  return fieldInfos.filter(
    (fieldInfo) => !isFieldAvailable(fieldInfo.fieldName, availableFieldNameSet)
  );
}

function createMissingFieldWarnings(fieldType, missingFields) {
  return missingFields.map(
    (fieldInfo) =>
      `Missing ${fieldType} AOI field: ${fieldInfo.label} (${fieldInfo.fieldName}). ${fieldInfo.reason}`
  );
}

function createAvailableFieldNameSet(fieldNames) {
  if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
    return null;
  }

  return new Set(
    fieldNames.map((fieldName) => normalizeOptionalString(fieldName).toLowerCase()).filter(Boolean)
  );
}

function isFieldAvailable(fieldName, availableFieldNameSet) {
  if (!availableFieldNameSet) {
    return true;
  }

  return availableFieldNameSet.has(normalizeOptionalString(fieldName).toLowerCase());
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
