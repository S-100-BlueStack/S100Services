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
  AOI_FIELD.OBJECT_ID,
  "ObjectID",
  "objectid",
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
  return [
    AOI_FIELD.OBJECT_ID,
    AOI_FIELD.DISPLAY_NAME,
    AOI_FIELD.SERIES,
    AOI_FIELD.EDITION,
    AOI_FIELD.LOCKED,
    AOI_FIELD.ISSUE_DATE,
    AOI_FIELD.IS_TECHNICAL,
    AOI_FIELD.UPDATE_TYPE,
    AOI_FIELD.PRODUCT_ID,
    AOI_FIELD.GLOBAL_ID,
  ];
}

export function createAoiPopupTemplate() {
  return {
    title: `{${AOI_FIELD.DISPLAY_NAME}}`,
    content: [
      {
        type: "fields",
        fieldInfos: createAoiPopupFieldInfos(),
      },
    ],
  };
}

export function createAoiPopupFieldInfos() {
  // Return new objects so ArcGIS can safely enrich popup metadata without mutating shared config.
  return AOI_POPUP_FIELD_INFOS.map((fieldInfo) => ({ ...fieldInfo }));
}
