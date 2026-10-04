import assert from "node:assert/strict";
import test from "node:test";

import { createInitialDataSourceProgress } from "./initialDataSourceProgress.js";

function createController(states) {
  let currentStates = states;
  const listeners = new Set();
  return {
    getStates: () => currentStates,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(nextStates) {
      currentStates = nextStates;
      for (const listener of listeners) listener(currentStates);
    },
  };
}

function sourceState(id, patch = {}) {
  return {
    source: { id },
    state: {
      sourceId: id,
      requestedEnabled: true,
      enabled: false,
      loading: true,
      error: null,
      ...patch,
    },
  };
}

test("initial source progress advances when independently loaded sources settle", () => {
  const controller = createController([sourceState("s57"), sourceState("s101")]);
  const updates = [];
  const progress = createInitialDataSourceProgress({
    controller,
    onProgress: (value) => updates.push(value),
  });

  progress.begin();
  controller.publish([sourceState("s57", { enabled: true, loading: false }), sourceState("s101")]);
  controller.publish([
    sourceState("s57", { enabled: true, loading: false }),
    sourceState("s101", { enabled: true, loading: false }),
  ]);
  progress.destroy();

  assert.deepEqual(
    updates.map(({ completed, total }) => [completed, total]),
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ]
  );
  assert.equal(updates[0].progress, 0.52);
  assert.equal(updates[1].progress, 0.74);
  assert.equal(updates[2].progress, 0.96);
  assert.equal(updates[1].text, "Loading data sources (1/2)...");
});

test("failed initial sources count as settled without hiding the remaining source", () => {
  const controller = createController([sourceState("s57"), sourceState("s101")]);
  const updates = [];
  const progress = createInitialDataSourceProgress({
    controller,
    onProgress: (value) => updates.push(value),
  });

  progress.begin();
  controller.publish([
    sourceState("s57", {
      requestedEnabled: false,
      loading: false,
      error: "S-57 AOI request failed",
    }),
    sourceState("s101"),
  ]);
  progress.destroy();

  assert.equal(updates.at(-1).completed, 1);
  assert.equal(updates.at(-1).total, 2);
  assert.equal(updates.at(-1).progress, 0.74);
});

test("startup without active runtime sources advances directly to the final source stage", () => {
  const controller = createController([]);
  const updates = [];
  const progress = createInitialDataSourceProgress({
    controller,
    onProgress: (value) => updates.push(value),
  });

  progress.begin();
  progress.destroy();

  assert.deepEqual(updates, [
    {
      progress: 0.96,
      completed: 0,
      total: 0,
      text: "Finalizing map...",
    },
  ]);
});
