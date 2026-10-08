import assert from "node:assert/strict";
import test from "node:test";
import { loadPackageHistory } from "./packageHistoryLoader.js";
import { fetchProductHistory } from "../api/productHistoryApi.js";
import {
  createPackageHarness,
  emptyHistory,
  deferred,
} from "../tests/packageHistoryTestSupport.js";

async function harness() {
  const h = createPackageHarness();
  const resolution = await h.workUnitService.resolveWorkUnit(h.names.s101);
  return { ...h, resolution, productContext: resolution.product };
}

for (const key of ["s101", "s57"]) {
  test(`exact ${key} entry opens canonical package with one explicit read per member`, async () => {
    const h = await harness();
    const context = h.resolution.memberProducts[key === "s101" ? 0 : 1];
    const calls = [];
    const result = await loadPackageHistory(context.datasetName, {
      ...h,
      productContext: context,
      fetchHistory: async (name, options) => {
        calls.push([name, options]);
        return emptyHistory(name);
      },
    });
    assert.equal(result.datasetName, h.names.s101);
    assert.deepEqual(
      result.members.map((member) => [member.label, member.datasetName]),
      [
        ["S-101", h.names.s101],
        ["S-57", h.names.s57],
      ]
    );
    assert.equal(calls.length, 2);
    calls.forEach(([name, options], index) => {
      assert.equal(options.productContext.datasetName, name);
      assert.equal(options.productContext.sourceId, index === 0 ? "s101" : "s57");
      assert.equal(options.validateOwnership, true);
    });
  });
}

for (const state of ["empty", "unavailable", "rejected", "foreign", "foreign-event"]) {
  test(`${state} member result preserves the other member's events`, async () => {
    const h = await harness();
    const own = {
      id: "own",
      datasetName: h.names.s101,
      actor: "operator",
      timestamp: "2026-10-08T08:00:00Z",
      details: [],
    };
    const result = await loadPackageHistory(h.names.s101, {
      ...h,
      fetchHistory: async (name) => {
        if (name === h.names.s101) return emptyHistory(name, { events: [own] });
        if (state === "rejected") throw new Error("Endpoint failed");
        if (state === "foreign") return emptyHistory(h.names.s101);
        if (state === "foreign-event")
          return emptyHistory(name, { events: [{ datasetName: h.names.s101 }] });
        return emptyHistory(name, { endpointAvailable: state !== "unavailable" });
      },
    });
    assert.deepEqual(result.members[0].history.events, [own]);
    if (["rejected", "foreign", "foreign-event"].includes(state)) {
      assert.equal(result.members[1].history, null);
      assert.ok(result.members[1].error);
    } else {
      assert.equal(result.members[1].history.events.length, 0);
      assert.equal(result.members[1].history.endpointAvailable, state !== "unavailable");
    }
  });
}

for (const failure of [
  "failed",
  "missing-member",
  "wrong-specification",
  "wrong-canonical",
  "wrong-key",
  "stale-assert",
  "replaced-source",
  "disabled-source",
]) {
  test(`${failure} package structure fails before optional reads`, async () => {
    const h = await harness();
    let resolution = structuredClone({ ...h.resolution, assertCurrent: undefined });
    resolution.assertCurrent = h.resolution.assertCurrent;
    if (failure === "failed") resolution.status = "failed";
    if (failure === "missing-member") resolution.memberProducts.pop();
    if (failure === "wrong-specification")
      resolution.memberProducts[1].data.attributes.productSpecification = "S101";
    if (failure === "wrong-canonical") resolution.product = resolution.memberProducts[1];
    if (failure === "wrong-key") resolution.workUnit.identityKey = "wrong";
    if (failure === "stale-assert")
      resolution.assertCurrent = () => {
        throw new Error("stale");
      };
    if (failure === "replaced-source" || failure === "disabled-source") {
      const source = structuredClone(h.registry.byId.get("s57"));
      if (failure === "disabled-source") source.enabledByConfiguration = false;
      h.registry.byId.set("s57", source);
    }
    let calls = 0;
    await assert.rejects(
      loadPackageHistory(h.names.s101, {
        ...h,
        workUnitService: { resolveWorkUnit: async () => resolution },
        fetchHistory: async () => {
          calls++;
        },
      })
    );
    assert.equal(calls, 0);
  });
}

test("mapping reassignment during member reads fails the entire snapshot", async () => {
  const h = await harness();
  const gate = deferred();
  const operation = loadPackageHistory(h.names.s101, {
    ...h,
    fetchHistory: async (name) => {
      await gate.promise;
      return emptyHistory(name);
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  h.metadata.s57 = "Reassigned member";
  gate.resolve();
  await assert.rejects(operation, /mapping|identity/);
});

for (const payload of [
  { Data: [{ Name: "foreign" }] },
  { Data: [], Events: [{ DatasetName: "foreign", EventType: "Export", Outcome: "Succeeded" }] },
  { Data: [{ Name: "Own" }, { Name: "foreign" }] },
]) {
  test("raw contradictory ownership is rejected before history normalization", async () => {
    const h = await harness();
    await assert.rejects(
      fetchProductHistory(h.names.s101, {
        productContext: h.productContext,
        validateOwnership: true,
        get: async () => payload,
      }),
      /different Product/
    );
  });
}

test("empty payload requires no invented ownership and Dashboard adapter remains unchanged", async () => {
  const h = await harness();
  const empty = await fetchProductHistory(h.names.s101, {
    productContext: h.productContext,
    validateOwnership: true,
    get: async () => ({ Data: [] }),
  });
  assert.equal(empty.datasetName, h.names.s101);
  assert.deepEqual(empty.events, []);
  const compatibility = await fetchProductHistory("Requested", {
    get: async () => ({ Data: [{ Name: "Existing" }] }),
  });
  assert.equal(compatibility.datasetName, "Existing");
});

test("explicit audit association remains local even when members share state-record IDs", async () => {
  const h = await harness();
  const result = await loadPackageHistory(h.names.s101, {
    ...h,
    fetchHistory: (name, options) =>
      fetchProductHistory(name, {
        ...options,
        get: async () => ({
          Data: [
            {
              Id: "shared",
              Name: name,
              Edition: 2,
              Update: 0,
              Status: 4,
              From: "2026-10-08T08:00:00Z",
              Owner: `owner-${name}`,
            },
            {
              Id: "old",
              Name: name,
              Edition: 1,
              Update: 0,
              Status: 4,
              From: "2026-10-07T08:00:00Z",
            },
          ],
          Events: [
            {
              Id: `audit-${name}`,
              DatasetName: name,
              StateRecordId: "shared",
              EventType: "Export",
              Outcome: "Succeeded",
              OccurredAtUtc: "2026-10-08T08:00:00Z",
            },
          ],
        }),
      }),
  });
  for (const member of result.members) {
    assert.equal(member.error, null);
    assert.equal(
      member.history.events.filter((event) => event.sourceKind === "explicit").length,
      1
    );
    assert.equal(
      member.history.events.find((event) => event.sourceKind === "explicit").datasetName,
      member.datasetName
    );
    assert.equal(
      member.history.events.filter((event) => event.stateRecordId === "shared").length,
      1
    );
    assert.ok(member.history.events.some((event) => event.stateRecordId === "old"));
  }
});
