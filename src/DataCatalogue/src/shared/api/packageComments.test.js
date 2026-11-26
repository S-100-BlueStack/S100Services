import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogueService } from "./catalogueService.js";

const operationId = "aaaa0000-0000-0000-0000-000000000001";
const eventId = "bbbb0000-0000-0000-0000-000000000001";
const occurredAtUtc = "2026-11-26T10:00:00Z";
const actor = "PROD\\reader";

test("Package decision sends only reason and operation UUID, with exact event-based readback", async () => {
  const calls = [];
  const item = {
    id: operationId,
    historyEventId: eventId,
    text: "Reason",
    actor,
    kind: "discardReason",
    occurredAtUtc,
  };
  const service = createCatalogueService({
    async request(path, options) {
      calls.push([path, options]);
      if (path.endsWith("/comments")) return { packageId: "pkg", items: [item], nextBefore: null };
      if (path.endsWith("/history"))
        return {
          packageId: "pkg",
          items: [
            {
              id: eventId,
              operationId,
              eventType: "packageDiscarded",
              occurredAtUtc,
              actor,
              commentText: item.text,
            },
          ],
          nextBefore: null,
        };
      return { ...item, assignmentStatus: "discarded" };
    },
  });
  await assert.rejects(
    service.savePackageOperation("pkg", { id: operationId, kind: "comment", text: "Unsupported" }),
    /Invalid Package operation/
  );
  assert.equal(calls.length, 0);
  await service.savePackageOperation("pkg", {
    id: operationId,
    kind: "discardReason",
    text: " Reason ",
  });
  assert.equal(calls[0][0], "/v1/packages/pkg/discarded");
  assert.deepEqual(calls[0][1].body, { operationId, discarded: true, reason: "Reason" });
  assert.equal((await service.packageComments("pkg")).items[0].historyEventId, eventId);
  const [history] = (await service.packageHistory("pkg")).items;
  assert.equal(history.id, eventId);
  assert.equal(history.operationId, operationId);
  assert.equal(history.commentText, "Reason");
  assert.equal(history.pipelineId, null);
});

test("Scoped comments reject mixed comment kinds and missing event identity", async () => {
  let payload;
  const service = createCatalogueService({ request: async () => payload });
  for (const item of [
    { id: operationId, historyEventId: eventId, kind: "reopen", actor, occurredAtUtc, text: null },
    { id: operationId, kind: "comment", actor, occurredAtUtc, text: "Saved" },
    {
      id: operationId,
      historyEventId: operationId,
      kind: "comment",
      actor,
      occurredAtUtc,
      text: "Saved",
    },
  ]) {
    payload = { packageId: "pkg", items: [item], nextBefore: null };
    await assert.rejects(service.packageComments("pkg"));
  }
});
