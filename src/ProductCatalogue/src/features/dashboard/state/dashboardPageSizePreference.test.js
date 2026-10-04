import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_PAGE_SIZE_STORAGE_KEY,
  readDashboardPageSizePreference,
  resetDashboardPageSizePreference,
  writeDashboardPageSizePreference,
} from "./dashboardPageSizePreference.js";

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("Dashboard page size defaults to 50 without saved state", () => {
  assert.equal(readDashboardPageSizePreference(createMemoryStorage()), 50);
});

test("Dashboard page size restores supported saved values", () => {
  for (const pageSize of [25, 50, 100, 200]) {
    const storage = createMemoryStorage({ [DASHBOARD_PAGE_SIZE_STORAGE_KEY]: String(pageSize) });
    assert.equal(readDashboardPageSizePreference(storage), pageSize);
  }
});

test("Dashboard page size falls back to 50 for malformed or unsupported saved values", () => {
  for (const value of ["", "invalid", "75", "250"]) {
    const storage = createMemoryStorage({ [DASHBOARD_PAGE_SIZE_STORAGE_KEY]: value });
    assert.equal(readDashboardPageSizePreference(storage), 50);
  }
});

test("Dashboard page size writes the logical numeric value and reset removes it", () => {
  const storage = createMemoryStorage();

  assert.equal(writeDashboardPageSizePreference(100, storage), 100);
  assert.equal(storage.getItem(DASHBOARD_PAGE_SIZE_STORAGE_KEY), "100");
  assert.equal(resetDashboardPageSizePreference(storage), 50);
  assert.equal(storage.getItem(DASHBOARD_PAGE_SIZE_STORAGE_KEY), null);
});
