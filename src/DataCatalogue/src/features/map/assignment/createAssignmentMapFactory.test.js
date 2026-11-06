import test from "node:test";
import assert from "node:assert/strict";
import { createAssignmentMapFactory } from "./createAssignmentMapFactory.js";

test("Mock map keeps its original factory and never requires a live catalogue", () => {
  const instance = {};
  let liveCalls = 0;
  const mockMap = () => instance;
  const factory = createAssignmentMapFactory({
    sourceMode: "mock",
    mockMap,
    liveMap: () => {
      liveCalls++;
      throw new Error("Unexpected live call");
    },
  });
  assert.equal(factory, mockMap);
  assert.equal(factory(), instance);
  assert.equal(liveCalls, 0);
});

test("Live map receives the catalogue and never falls back to mock on failure", () => {
  const catalogue = {};
  let mockCalls = 0;
  const factory = createAssignmentMapFactory({
    sourceMode: "live",
    catalogue,
    mockMap: () => {
      mockCalls++;
    },
    liveMap: (options) => {
      assert.equal(options.catalogue, catalogue);
      assert.equal(options.container, "map");
      throw new Error("Map unavailable");
    },
  });
  assert.throws(() => factory({ container: "map" }), /Map unavailable/);
  assert.equal(mockCalls, 0);
  assert.throws(() => createAssignmentMapFactory({ sourceMode: "unknown" }), /Unsupported/);
});
