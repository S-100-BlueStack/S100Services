import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardLoadPresentation } from "./dashboardLoadPresentation.js";

test("formats the last successful Dashboard load as HH:MM with full local context", () => {
  const timestamp = new Date(2026, 8, 17, 8, 7, 42);
  const presentation = createDashboardLoadPresentation(timestamp);

  assert.equal(presentation.text, "08:07");
  assert.equal(presentation.title, `Last successful dashboard load: ${timestamp.toLocaleString()}`);
  assert.equal(presentation.ariaLabel, presentation.title);
});

test("rejects an invalid Dashboard load timestamp", () => {
  assert.throws(
    () => createDashboardLoadPresentation("not-a-date"),
    /A valid Dashboard load timestamp is required\./
  );
});
