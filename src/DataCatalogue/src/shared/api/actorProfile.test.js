import assert from "node:assert/strict";
import test from "node:test";
import { normalizeActorProfile } from "./actorProfile.js";
import { createCatalogueClient } from "./catalogueClient.js";
import { createCatalogueService } from "./catalogueService.js";

const ACTOR = "PROD\\B123456";
const EVENT = "00000000-0000-4000-8000-000000000001";
const response = {
  actor: ACTOR,
  displayName: "Example user",
  photoMediaType: "image/jpeg",
  photoBase64: "/9j/AA==",
};

test("Actor profile reads only the canonical Package and event with existing credentials", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const service = createCatalogueService(
    createCatalogueClient({
      baseUrl: "/api",
      credentials: "include",
      async fetchImpl(url, options) {
        calls.push({ url, options });
        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        });
      },
    })
  );
  assert.deepEqual(
    await service.packageHistoryProfile("opaque/id", EVENT, { actor: ACTOR, signal }),
    { displayName: "Example user", photoSrc: "data:image/jpeg;base64,/9j/AA==" }
  );
  assert.equal(calls[0].url, `/api/v1/packages/opaque%2Fid/history/${EVENT}/profile`);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.signal, signal);
  await assert.rejects(service.packageHistoryProfile("id", EVENT, { actor: "System" }));
  await assert.rejects(service.packageHistoryProfile("id", "invalid", { actor: ACTOR }));
  assert.equal(calls.length, 1);
});

test("Actor profile allows names without photos and rejects mismatched identities or unsafe images", () => {
  assert.equal(normalizeActorProfile(null, ACTOR), null);
  assert.deepEqual(
    normalizeActorProfile({ ...response, photoMediaType: null, photoBase64: null }, ACTOR),
    { displayName: "Example user", photoSrc: null }
  );
  for (const invalid of [
    { ...response, actor: "OTHER\\B123456" },
    { ...response, photoMediaType: "image/svg+xml" },
    { ...response, photoBase64: "https://example.org/photo.jpg" },
    { ...response, photoBase64: "AAAA" },
    { ...response, photoBase64: "A".repeat(136540) },
    { ...response, photoBase64: null },
    { ...response, displayName: {} },
  ]) {
    assert.throws(() => normalizeActorProfile(invalid, ACTOR), /invalid actor profile/);
  }
});
