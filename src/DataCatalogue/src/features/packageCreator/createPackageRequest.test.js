import assert from "node:assert/strict";
import test from "node:test";
import { createPackageRequest, manualPackageCategories } from "./createPackageRequest.js";

const categories = manualPackageCategories([
  { id: "ENC" },
  { id: "Landdata" },
  { id: "CoastAndRock" },
  { id: "WorkZone" },
  { id: "MarineAggregateExtraction" },
  { id: "enc" },
  { id: "Other", name: "Live name" },
]);
const aoi = {
  rings: [
    [
      [12, 55],
      [12, 56],
      [13, 56],
      [13, 55],
      [12, 55],
    ],
  ],
  spatialReference: { wkid: 4326 },
};

test("manual category policy mirrors exact archive-only IDs", () => {
  assert.deepEqual(
    categories.map(({ id }) => id),
    ["WorkZone", "MarineAggregateExtraction", "enc", "Other"]
  );
  assert.throws(
    () => createPackageRequest({ category: "ENC" }, categories, aoi),
    /Select a category/
  );
});

test("absolute source reference is preserved and unset optionals are omitted", () => {
  for (const absoluteUri of [
    "https://example.invalid/a%20b?x=1#reference",
    "urn:example:item",
    "file:///C:/examples/shape",
    "database://e5c5898f-55b0-46b5-91e6-18031613b873",
  ]) {
    assert.deepEqual(createPackageRequest({ category: "WorkZone", absoluteUri }, categories, aoi), {
      category: "WorkZone",
      absoluteUri,
      esriJSON: JSON.stringify(aoi),
    });
  }
  for (const absoluteUri of [
    "",
    "109097",
    "../file",
    " https://example.invalid",
    "http:missing-slashes",
    "https:///",
  ]) {
    assert.throws(
      () =>
        createPackageRequest(
          { category: "WorkZone", absoluteUri, refId: "109097" },
          categories,
          aoi
        ),
      /absolute Source URI/
    );
  }
});

test("metadata text is preserved and descriptions are encoded as literal text", () => {
  const fields = {
    category: "WorkZone",
    absoluteUri: "mailto:source@example.invalid",
    refId: "001234",
    title: "  Original title  ",
    type: "",
    source: "Source label",
    description: "<img onerror=alert(1)> & original\nNext line",
    descriptionLanguage: "da",
    priority: "custom",
    severity: "0009007199254740993",
  };
  const request = createPackageRequest(fields, categories, aoi);
  assert.deepEqual(request.metaData, {
    refId: fields.refId,
    title: fields.title,
    source: fields.source,
  });
  assert.deepEqual(request.descriptions, [
    {
      language: "da",
      description: "&lt;img onerror=alert(1)&gt; &amp; original\nNext line",
    },
  ]);
  assert.equal(request.severity, "9007199254740993");
  for (const severity of ["18446744073709551616", "-1", "1e4", "0.1", " 0"]) {
    assert.throws(() => createPackageRequest({ ...fields, severity }, categories, aoi), /Severity/);
  }
  assert.throws(() => createPackageRequest(fields, categories, null), /valid AOI area/);
});

test("priority presets omit or encode exact Severity and never submit stale custom content", () => {
  const fields = { category: "WorkZone", absoluteUri: "urn:example:item", severity: "unselected" };
  assert.equal(Object.hasOwn(createPackageRequest(fields, categories, aoi), "severity"), false);
  assert.equal(
    createPackageRequest({ ...fields, priority: "highest" }, categories, aoi).severity,
    "0"
  );
  const custom = (severity) =>
    createPackageRequest({ ...fields, priority: "custom", severity }, categories, aoi);
  assert.equal(custom("18446744073709551615").severity, "18446744073709551615");
  assert.equal(custom("9007199254740993").severity, "9007199254740993");
  assert.throws(() => custom(""), /Severity/);
});

test("description language choices preserve the optional contract", () => {
  const fields = {
    category: "WorkZone",
    absoluteUri: "urn:example:item",
    description: "Example",
    language: " de ",
  };
  const description = (descriptionLanguage) =>
    createPackageRequest({ ...fields, descriptionLanguage }, categories, aoi).descriptions[0];
  assert.deepEqual(description(""), { description: "Example" });
  assert.equal(description("da").language, "da");
  assert.equal(description("en").language, "en");
  assert.equal(description("other").language, "de");
  assert.throws(
    () =>
      createPackageRequest(
        { ...fields, descriptionLanguage: "other", language: "" },
        categories,
        aoi
      ),
    /Enter a language code/
  );
});
