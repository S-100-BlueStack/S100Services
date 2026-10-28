import assert from "node:assert/strict";
import test from "node:test";
import { fetchProductHistory } from "./productHistoryApi.js";
import { normalizeProductHistoryResponse } from "../model/productHistoryTypes.js";
import { associateProductHistoryEvents } from "../model/productHistoryAuditEvents.js";

const stateId = "29fd9918-01fb-4322-94d6-12a72e4d59d7";
const previousId = "b58779af-2e06-4b11-ac94-5f3b3b346f7a";
const eventId = "10070477-0c68-4f72-9b86-6098b6274b0c";

function legacyRows(operation = "Export") {
  return [
    {
      Id: stateId,
      Name: "101DK001",
      Status: 2,
      Edition: operation === "Export" ? 2 : 1,
      Update: 0,
      From: "2026-09-11T10:00:00Z",
      To: "9999-12-31T00:00:00Z",
    },
    {
      Id: previousId,
      Name: "101DK001",
      Status: 2,
      Edition: operation === "Export" ? 1 : 2,
      Update: 0,
      From: "2026-09-10T10:00:00Z",
      To: "2026-09-11T10:00:00Z",
    },
  ];
}

function explicit(overrides = {}) {
  return {
    Id: eventId,
    DatasetName: "101DK001",
    EventType: "Export",
    Outcome: "Succeeded",
    StateRecordId: stateId,
    OperationId: "855cebc7-5b7a-4482-914e-74b8281cd394",
    JobId: "42",
    CorrelationId: "audit-test",
    Code: "OPERATION_SUCCEEDED",
    SafeMessage: "The operation completed successfully.",
    ExportTarget: "S101",
    OperationMetadata: { ResultEdition: "2" },
    OccurredAtUtc: "2026-09-11T10:05:00Z",
    ...overrides,
  };
}

async function history(payload) {
  return fetchProductHistory("101DK001", { get: async () => payload });
}

test("legacy-only payload preserves state identity and inferred operations", async () => {
  const result = await history({ Data: legacyRows(), TotalHits: 2 });
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].type, "export");
  assert.equal(result.events[0].stateRecordId, stateId);
  assert.equal(result.events[0].sourceKind, "legacy");
});

test("explicit events preserve audit identities and use the shared detail model", async () => {
  const row = explicit();
  const result = await history({ Data: [], Events: [row], EventTotalHits: 1 });
  const event = result.events[0];
  assert.equal(event.id, eventId);
  assert.equal(event.stateRecordId, stateId);
  assert.equal(event.operationId, row.OperationId);
  assert.equal(event.jobId, "42");
  assert.equal(event.correlationId, "audit-test");
  assert.equal(event.sourceKind, "explicit");
  assert.equal(event.outcome, "Succeeded");
  assert.equal(event.rawEventType, "Export");
  assert.equal(event.rawOutcome, "Succeeded");
  assert.deepEqual(event.operationMetadata, { ResultEdition: "2" });
  assert.ok(event.details.some((d) => d.label === "Export target" && d.value === "S-101"));
  assert.ok(event.details.some((d) => d.label === "State record ID" && d.value === stateId));
});

for (const operation of ["Export", "Rollback"]) {
  for (const outcome of ["Succeeded", "SucceededWithWarning"]) {
    test(`matching ${operation}/${outcome} suppresses its legacy operation`, async () => {
      const result = await history({
        Data: legacyRows(operation),
        Events: [explicit({ EventType: operation, Outcome: outcome })],
      });
      assert.equal(result.events.length, 2);
      assert.equal(result.events.filter((e) => e.sourceKind === "explicit").length, 1);
      assert.equal(result.events.find((e) => e.sourceKind === "legacy").stateRecordId, previousId);
    });
  }
}

for (const [name, overrides] of [
  ["Failed", { Outcome: "Failed" }],
  ["RequiresManualReview", { Outcome: "RequiresManualReview" }],
  ["unknown outcome", { Outcome: "FutureOutcome" }],
  ["different StateRecordId", { StateRecordId: previousId }],
  ["missing StateRecordId", { StateRecordId: null }],
  ["different operation", { EventType: "Rollback" }],
  ["unknown operation", { EventType: "FutureProducerType" }],
  ["Freeze", { EventType: "Freeze" }],
]) {
  test(`${name} does not suppress a legacy Export`, async () => {
    const result = await history({ Data: legacyRows(), Events: [explicit(overrides)] });
    assert.equal(result.events.length, 3);
    assert.ok(result.events.some((e) => e.sourceKind === "legacy" && e.stateRecordId === stateId));
  });
}

for (const type of ["status", "freeze", "unfreeze", "note", "send"]) {
  test(`legacy ${type} remains visible even with a matching successful state reference`, () => {
    const result = associateProductHistoryEvents(
      [{ sourceKind: "legacy", type, stateRecordId: stateId }],
      [
        {
          sourceKind: "explicit",
          type: "export",
          rawEventType: "Export",
          outcome: "Succeeded",
          stateRecordId: stateId,
        },
      ]
    );
    assert.equal(result.length, 2);
  });
}

test("unknown explicit event and outcome remain neutral and retain original values", async () => {
  const result = await history({
    Events: [explicit({ EventType: "FutureProducerType", Outcome: "FutureOutcome" })],
  });
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.equal(event.type, "note");
  assert.equal(event.presentationType, "note");
  assert.equal(event.rawEventType, "FutureProducerType");
  assert.equal(event.rawType, "FutureProducerType");
  assert.equal(event.outcome, "FutureOutcome");
  assert.equal(event.rawOutcome, "FutureOutcome");
  assert.ok(event.details.some((d) => d.value === "FutureProducerType"));
  assert.ok(event.details.some((d) => d.value === "FutureOutcome"));
});

test("unknown legacy event type survives neutral fallback normalization", () => {
  const result = normalizeProductHistoryResponse({ events: [{ type: "FutureLegacyType" }] });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, "note");
  assert.equal(result.events[0].rawType, "FutureLegacyType");
  assert.ok(result.events[0].details.some((d) => d.value === "FutureLegacyType"));
});

test("timestamps do not deduplicate events", async () => {
  const sameTime = "2026-09-11T10:00:00Z";
  const result = await history({
    Data: legacyRows(),
    Events: [
      explicit({ OccurredAtUtc: sameTime, StateRecordId: null }),
      explicit({ Id: "another-event", OccurredAtUtc: sameTime, StateRecordId: null }),
    ],
  });
  assert.equal(result.events.length, 4);
});

test("camel-case envelopes and explicit fields remain supported", async () => {
  const event = Object.fromEntries(
    Object.entries(explicit()).map(([key, value]) => [key[0].toLowerCase() + key.slice(1), value])
  );
  const result = await history({ data: [], events: [event] });
  assert.equal(result.events[0].stateRecordId, stateId);
  assert.equal(result.events[0].outcome, "Succeeded");
});

test("unknown legacy outcome retains raw value and neutral presentation", () => {
  const result = normalizeProductHistoryResponse({
    events: [{ type: "export", outcome: "FutureOutcome" }],
  });
  assert.equal(result.events[0].presentationType, "note");
  assert.equal(result.events[0].outcome, "FutureOutcome");
  assert.equal(result.events[0].rawOutcome, "FutureOutcome");
  assert.ok(result.events[0].details.some((d) => d.value === "FutureOutcome"));
});

for (const rawType of ["toString", "constructor", "__proto__"]) {
  test(`unknown type ${rawType} cannot inherit operation semantics`, async () => {
    const result = await history({
      Data: legacyRows(),
      Events: [explicit({ EventType: rawType })],
    });
    assert.equal(result.events.length, 3);
    const event = result.events.find((e) => e.sourceKind === "explicit");
    assert.equal(event.type, "note");
    assert.equal(event.rawEventType, rawType);
    assert.equal(event.presentationType, "note");
  });
}

test("raw future values survive normalization without being reinterpreted", async () => {
  const result = await history({
    Events: [explicit({ EventType: " FutureType ", Outcome: " Succeeded " })],
  });
  const event = result.events[0];
  assert.equal(event.rawType, " FutureType ");
  assert.equal(event.rawEventType, " FutureType ");
  assert.equal(event.rawOutcome, " Succeeded ");
  assert.equal(event.outcome, " Succeeded ");
  assert.equal(event.presentationType, "note");
});

function duplicateLegacyRows(operation = "Export") {
  const [newest, oldest] = legacyRows(operation);
  return [
    { ...newest, Edition: operation === "Export" ? 3 : 1 },
    { ...newest, Edition: 2, From: "2026-09-10T10:00:00Z" },
    { ...oldest, Edition: operation === "Export" ? 1 : 3, From: "2026-09-09T10:00:00Z" },
  ];
}

for (const operation of ["Export", "Rollback"]) {
  for (const outcome of ["Succeeded", "SucceededWithWarning"]) {
    test(`duplicate legacy IDs prevent ${operation}/${outcome} suppression`, async () => {
      const result = await history({
        Data: duplicateLegacyRows(operation),
        Events: [explicit({ EventType: operation, Outcome: outcome })],
      });
      const ambiguous = result.events.filter(
        (event) => event.sourceKind === "legacy" && event.stateRecordId === stateId
      );
      assert.equal(result.events.length, 4);
      assert.equal(ambiguous.length, 2);
      assert.ok(ambiguous.every((event) => event.type === operation.toLowerCase()));
      assert.notEqual(ambiguous[0].timestamp, ambiguous[1].timestamp);
      assert.equal(result.events.filter((event) => event.sourceKind === "explicit").length, 1);
    });
  }
}

for (const type of ["status", "note", "freeze", "unfreeze"]) {
  test(`a duplicate ID on legacy ${type} also prevents Export suppression`, () => {
    const result = associateProductHistoryEvents(
      [
        { sourceKind: "legacy", type: "export", stateRecordId: stateId },
        { sourceKind: "legacy", type, stateRecordId: stateId },
      ],
      [
        {
          sourceKind: "explicit",
          type: "export",
          rawEventType: "Export",
          outcome: "Succeeded",
          stateRecordId: stateId,
        },
      ]
    );
    assert.equal(result.filter((event) => event.sourceKind === "legacy").length, 2);
    assert.equal(result.length, 3);
  });
}

test("an ambiguous ID does not disable suppression for another unique legacy ID", async () => {
  const uniqueId = "e1869a12-b245-4a6b-9ca0-867eb4b50a62";
  const rows = duplicateLegacyRows();
  rows[0].Edition = 4;
  rows[1].Edition = 3;
  rows.splice(2, 0, { ...rows[1], Id: uniqueId, Edition: 2 });
  const result = await history({
    Data: rows,
    Events: [explicit(), explicit({ Id: "second-explicit-event", StateRecordId: uniqueId })],
  });
  assert.equal(result.events.length, 5);
  const legacy = result.events.filter((event) => event.sourceKind === "legacy");
  assert.equal(legacy.filter((event) => event.stateRecordId === stateId).length, 2);
  assert.ok(!legacy.some((event) => event.stateRecordId === uniqueId));
  assert.equal(result.events.filter((event) => event.sourceKind === "explicit").length, 2);
});

test("legacy ID ambiguity is scoped to the current History payload", async () => {
  const ambiguous = await history({ Data: duplicateLegacyRows(), Events: [explicit()] });
  assert.equal(ambiguous.events.length, 4);
  const unique = await history({ Data: legacyRows(), Events: [explicit()] });
  assert.equal(unique.events.length, 2);
  assert.ok(
    !unique.events.some((event) => event.sourceKind === "legacy" && event.stateRecordId === stateId)
  );
});

test("multiple explicit references do not make a unique legacy ID ambiguous", async () => {
  const result = await history({
    Data: legacyRows(),
    Events: [explicit(), explicit({ Id: "second-explicit-event" })],
  });
  assert.equal(result.events.length, 3);
  assert.equal(result.events.filter((event) => event.sourceKind === "explicit").length, 2);
  assert.equal(result.events.filter((event) => event.sourceKind === "legacy").length, 1);
});
