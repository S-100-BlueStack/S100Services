import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRefreshCoordinator } from "./dataSourceRefreshCoordinator.js";

test("refresh reports failure only after both independent pipelines settle", async () => {
  const completed = [];
  let finishSource;
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: {
      refresh: async () => {
        throw new Error("Lookup failed");
      },
    },
    dataSourceController: {
      refreshActive: () =>
        new Promise((resolve) => {
          finishSource = resolve;
        }),
    },
    onRefreshComplete: (result) => completed.push(result),
  });
  const pending = coordinator.refresh();
  await Promise.resolve();
  assert.equal(completed.length, 0);
  finishSource({ success: true, failedSourceIds: [] });
  const result = await pending;
  assert.equal(result.success, false);
  assert.equal(completed.length, 1);
  assert.equal(coordinator.isRefreshInProgress(), false);
});
