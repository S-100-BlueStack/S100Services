import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAttributeFilterFieldDefinitions,
  getAttributeFilterFieldLabel,
  getCanonicalAttributeFilterFieldName,
  isConfiguredAttributeFilterField,
} from "./attributeFilterConfig.js";

describe("attributeFilterConfig", () => {
  it("only exposes the approved main map filters", () => {
    assert.deepEqual(
      getAttributeFilterFieldDefinitions().map((definition) => definition.fieldName),
      ["displayScale", "status", "usageBand"]
    );
  });

  it("normalizes display scale, status, and usage band aliases", () => {
    assert.equal(getCanonicalAttributeFilterFieldName("DisplayScale"), "displayScale");
    assert.equal(getCanonicalAttributeFilterFieldName("Status"), "status");
    assert.equal(getCanonicalAttributeFilterFieldName("UsageBand"), "usageBand");
  });

  it("rejects retired filter fields", () => {
    assert.equal(isConfiguredAttributeFilterField("Edition"), false);
    assert.equal(isConfiguredAttributeFilterField("Update"), false);
    assert.equal(isConfiguredAttributeFilterField("IssueDate"), false);
  });

  it("uses product-facing filter labels", () => {
    assert.equal(getAttributeFilterFieldLabel("DisplayScale"), "Display scale");
    assert.equal(getAttributeFilterFieldLabel("Status"), "Status");
    assert.equal(getAttributeFilterFieldLabel("UsageBand"), "Usage band");
  });
});
