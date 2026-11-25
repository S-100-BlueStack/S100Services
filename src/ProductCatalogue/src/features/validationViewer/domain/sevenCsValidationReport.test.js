import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeValidationReport,
  parseSevenCsValidationReport,
  selectValidationChecks,
} from "./sevenCsValidationReport.js";

// Node has no browser DOMParser. Model the parsed XML tree for projection tests;
// the actual DOMParser and uploaded VLD bytes are verified in browser acceptance.
function xml(tagName, attributes = {}, content = "", children = []) {
  return {
    tagName,
    children,
    textContent: content || children.map((child) => child.textContent).join(""),
    getAttribute: (name) => attributes[name] ?? null,
    getElementsByTagName(name) {
      return children.flatMap((child) => [
        ...(child.tagName === name ? [child] : []),
        ...child.getElementsByTagName(name),
      ]);
    },
  };
}
const field = (name, value) => xml(name, {}, value);
const group = (title, children = []) => xml("LogGroup", { Title: title }, "", children);
const entry = (severity, children) => xml("LogEntry", { Severity: severity }, "", children);
const info = (value) => entry("information", [field("Message", value)]);
function occurrence(severity, id = "0000123") {
  const object = xml("ObjName", {}, "", [
    field("Cellname", "TEST"),
    field("S57ClassDescription", "Obstruction"),
    xml("EncObject", {}, "", [field("EncObjType", "100"), field("EncObjId", id)]),
    field("PosLat", "57 43.124646 N"),
    field("PosLon", "010 36.031950 E"),
  ]);
  return entry(severity, [
    field("Category", "Topology"),
    field("Message", "<b>Finding</b> <img src=x onerror=alert(1)>"),
    field("SuggestedSolution", "Check geometry."),
    field("Reference", "S-158:101 check 101_1240"),
    object,
    xml("RelatedObject", {}, "", [object]),
  ]);
}
function fixture({
  summary = "Critical 12, Error 1, Warning 0",
  datasetSummary = "Critical 12",
  featureSummary = "Error 1",
  dataset = "TEST",
  checkTitle = "SampleCheck : Critical 12 (2 shown)",
  extra = [],
} = {}) {
  const root = xml("LogDocument", { Toolname: "7Cs Analyzer" }, "", [
    group("7Cs Analyzer © 5.5.0 Build 10"),
    group(`${dataset} : ${summary}`),
    group("Validation Parameters", [info("Validation Start: 2026-11-09T14:32:40+0100")]),
    group("Dataset Metadata", [info(`Dataset File Identifier: ${dataset}.000`)]),
    group(
      `Dataset Entries : ${datasetSummary}`,
      datasetSummary === "No Errors"
        ? []
        : [group(checkTitle, [occurrence("critical"), occurrence("critical", "0000999")])]
    ),
    group(
      `Feature and Geometry Entries : ${featureSummary}`,
      featureSummary === "No Errors" ? [] : [group("AnotherCheck : Error 1", [occurrence("error")])]
    ),
    ...extra,
  ]);
  return { parseFromString: () => ({ documentElement: root, getElementsByTagName: () => [] }) };
}

test("uses declared counts without counting truncated detail entries as all findings", () => {
  const report = parseSevenCsValidationReport("<fixture/>", {
    parser: fixture(),
    expectedDatasetName: "test",
  });
  assert.deepEqual(report.totals, { Critical: 12, Error: 1, Warning: 0 });
  assert.equal(report.reportedCount, 13);
  assert.equal(report.shownCount, 3);
  assert.equal(report.checks[0].reportedCount, 12);
  assert.equal(report.checks[0].occurrences.length, 2);
  const item = report.checks[0].occurrences[0];
  assert.equal(item.objects[0].id, "0000123");
  assert.equal(item.relatedObjects[0].latitude, "57 43.124646 N");
  assert.equal(item.message, "Finding <img src=x onerror=alert(1)>");
  assert.deepEqual(item.references, ["S-158:101 check 101_1240"]);
  assert.equal(item.solution, "Check geometry.");
});

test("filters by severity and searches available object identities without altering reported totals", () => {
  const report = parseSevenCsValidationReport("<fixture/>", { parser: fixture() });
  const results = selectValidationChecks(report, "Critical", "0000999");
  assert.equal(results.length, 1);
  assert.equal(results[0].occurrences.length, 1);
  assert.equal(results[0].check.reportedCount, 12);
  assert.equal(selectValidationChecks(report, "Warning", "").length, 0);
  assert.equal(selectValidationChecks(report, "failures", "101_1240").length, 2);
});

test("an explicitly empty report has zero findings; inconsistent totals never become a clean report", () => {
  const report = parseSevenCsValidationReport("<fixture/>", {
    parser: fixture({
      summary: "No Errors",
      datasetSummary: "No Errors",
      featureSummary: "No Errors",
    }),
  });
  assert.equal(report.reportedCount, 0);
  assert.equal(report.checks.length, 0);
  assert.throws(
    () =>
      parseSevenCsValidationReport("<fixture/>", {
        parser: fixture({ summary: "Critical 0, Error 1" }),
      }),
    /totals/
  );
  assert.throws(
    () =>
      parseSevenCsValidationReport("<fixture/>", {
        parser: fixture({ checkTitle: "SampleCheck : Critical 12 (1 shown)" }),
      }),
    /count or severity/
  );
});

test("rejects mismatched Product identity, DTD, malformed XML and unsupported finding structure", () => {
  assert.throws(
    () =>
      parseSevenCsValidationReport("<fixture/>", {
        parser: fixture(),
        expectedDatasetName: "OTHER",
      }),
    /different Product/
  );
  assert.throws(
    () =>
      parseSevenCsValidationReport("<!DOCTYPE LogDocument SYSTEM 'https://example.invalid/test'>", {
        parser: fixture(),
      }),
    /document type/
  );
  assert.throws(
    () =>
      parseSevenCsValidationReport("<bad>", {
        parser: {
          parseFromString: () => ({ documentElement: null, getElementsByTagName: () => [1] }),
        },
      }),
    /not a readable/
  );
  assert.throws(
    () =>
      parseSevenCsValidationReport("<fixture/>", {
        parser: fixture({ extra: [group("Unknown", [occurrence("error")])] }),
      }),
    /unsupported finding entries/
  );
});

test("invalid UTF-8 is reported without mutating the original bytes", () => {
  const bytes = Uint8Array.from([0x61, 0xff, 0x62]);
  assert.deepEqual(decodeValidationReport(bytes), { text: "a\ufffdb", encodingWarning: true });
  assert.deepEqual([...bytes], [0x61, 0xff, 0x62]);
  assert.deepEqual(decodeValidationReport(new TextEncoder().encode("\u00e6\u00f8\u00e5")), {
    text: "\u00e6\u00f8\u00e5",
    encodingWarning: false,
  });
});
