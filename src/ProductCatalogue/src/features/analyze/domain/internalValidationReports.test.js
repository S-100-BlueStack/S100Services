import assert from "node:assert/strict";
import test from "node:test";

import { normalizeInternalValidationReports } from "./internalValidationReports.js";

test("normalizeInternalValidationReports returns an empty list for missing input", () => {
  assert.deepEqual(normalizeInternalValidationReports(null), []);
  assert.deepEqual(normalizeInternalValidationReports(undefined), []);
});

test("normalizeInternalValidationReports normalizes string reports", () => {
  const reports = normalizeInternalValidationReports(["<Report><Status>OK</Status></Report>"]);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, "Internal validation report 1");
  assert.equal(reports[0].format, "xml");
  assert.equal(reports[0].content, "<Report><Status>OK</Status></Report>");
});

test("normalizeInternalValidationReports supports backend wrapper objects", () => {
  const reports = normalizeInternalValidationReports({
    InternalValidationReports: [
      {
        ReportId: "validation-summary",
        Title: "Validation summary",
        Status: "Warning",
        GeneratedAt: "2026-07-07T10:00:00Z",
        ContentType: "application/json",
        Json: {
          warnings: 2,
          errors: 0,
        },
      },
    ],
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].id, "validation-summary");
  assert.equal(reports[0].title, "Validation summary");
  assert.equal(reports[0].status, "Warning");
  assert.equal(reports[0].generatedAt, "2026-07-07T10:00:00Z");
  assert.equal(reports[0].format, "json");
  assert.deepEqual(reports[0].content, {
    warnings: 2,
    errors: 0,
  });
});

test("normalizeInternalValidationReports removes empty report candidates", () => {
  const reports = normalizeInternalValidationReports([
    "",
    {},
    {
      Name: "Validation details",
      Text: "All internal checks passed.",
    },
  ]);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, "Validation details");
  assert.equal(reports[0].content, "All internal checks passed.");
});
