import test from "node:test";
import assert from "node:assert/strict";
import { matchesLoadedPackage } from "./matchesLoadedPackage.js";

const packageSummary = { name: "NM260001", shortId: "NM001", title: "Harbour closure" };

test("Package search matches name, short ID and title on one loaded page", () => {
  for (const query of ["nm260", "nm001", "HARBOUR", " closure ", ""]) {
    assert.equal(matchesLoadedPackage(packageSummary, query), true);
  }
  assert.equal(matchesLoadedPackage(packageSummary, "unrelated"), false);
});

test("Package search does not falsely claim to index unprovided backend details", () => {
  assert.equal(matchesLoadedPackage({ name: "A", details: "secret context" }, "secret"), false);
  assert.equal(matchesLoadedPackage(null, "search"), false);
});
