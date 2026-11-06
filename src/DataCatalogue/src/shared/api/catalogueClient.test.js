import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogueClient, parseExactJson } from "./catalogueClient.js";
import {
  normalizeSeverity,
  severityLabel,
  compareSeverity,
  UNPRIORITIZED_SEVERITY,
} from "../domain/severity.js";

const json = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

test("transport keeps raw numeric uint64 precision and quoted content", async () => {
  const client = createCatalogueClient({
    fetchImpl: async () =>
      json(
        '{"severity":18446744073709551615,"text":"\\"severity\\":18446744073709551615","small":0}'
      ),
  });
  const value = await client.request("/api/v1/packages");
  assert.equal(value.severity, UNPRIORITIZED_SEVERITY);
  assert.equal(value.text, '"severity":18446744073709551615');
  assert.equal(value.small, 0);
  assert.equal(severityLabel(value.severity), "Not prioritized");
});

test("exact JSON parsing preserves valid JSON semantics and rejects malformed numeric syntax", () => {
  assert.deepEqual(parseExactJson('{"x":1.25,"y":1e2,"z":-9007199254740993,"s":"123\\\\456"}'), {
    x: 1.25,
    y: 100,
    z: "-9007199254740993",
    s: "123\\456",
  });
  for (const text of ['{"x":01}', '{"x":+1}', '{"x":NaN}', '{"x":1,}'])
    assert.throws(() => parseExactJson(text));
});

test("Severity has exact ascending order, unknown separately and sentinel last", () => {
  const values = [UNPRIORITIZED_SEVERITY, "9007199254740993", null, "0", "9007199254740992", "1"];
  assert.deepEqual(values.sort(compareSeverity), [
    "0",
    "1",
    "9007199254740992",
    "9007199254740993",
    null,
    UNPRIORITIZED_SEVERITY,
  ]);
  assert.equal(severityLabel(null), "Unspecified");
  assert.equal(severityLabel(0), "Severity 0");
  for (const value of [
    Number(UNPRIORITIZED_SEVERITY),
    -1,
    1.1,
    "18446744073709551616",
    "01",
    "high",
    true,
  ])
    assert.throws(() => normalizeSeverity(value));
});

test("transport forwards credentials, body, encoded query and AbortSignal", async () => {
  const abort = new AbortController();
  let request;
  const client = createCatalogueClient({
    baseUrl: "/catalogue/",
    credentials: "include",
    fetchImpl: async (...args) => {
      request = args;
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(
    await client.request("/api/v1/dispatcher/bindings", {
      query: { packageId: "a/b &", hasPipeline: false },
      method: "POST",
      body: { packageId: "p", pipelineId: "q" },
      signal: abort.signal,
    }),
    null
  );
  assert.equal(
    request[0],
    "/catalogue/api/v1/dispatcher/bindings?packageId=a%2Fb+%26&hasPipeline=false"
  );
  assert.equal(request[1].credentials, "include");
  assert.equal(request[1].signal, abort.signal);
  assert.equal(request[1].redirect, "error");
  assert.deepEqual(JSON.parse(request[1].body), { packageId: "p", pipelineId: "q" });
});

test("ProblemDetails exposes validation messages and HTTP status", async () => {
  const client = createCatalogueClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ title: "Invalid input", errors: { page: ["Must be positive"] } }),
        { status: 400, headers: { "content-type": "application/problem+json" } }
      ),
  });
  await assert.rejects(
    client.request("/api/v1/packages"),
    (error) =>
      error.status === 400 &&
      error.message.includes("Must be positive") &&
      error.errors.page.length === 1
  );
});

for (const [status, message] of [
  [401, "Authentication required"],
  [403, "Access denied"],
  [502, "HTTP 502"],
]) {
  test(`non-JSON HTTP ${status} is an error without exposing HTML`, async () => {
    const client = createCatalogueClient({
      fetchImpl: async () => new Response("<html>private proxy content</html>", { status }),
    });
    await assert.rejects(
      client.request("/api/v1/packages"),
      (error) =>
        error.status === status &&
        error.message.includes(message) &&
        !error.message.includes("html")
    );
  });
}

test("non-JSON success, empty success and invalid JSON are distinguished", async () => {
  const responses = [new Response("plain text"), new Response(""), json("{")];
  const client = createCatalogueClient({ fetchImpl: async () => responses.shift() });
  assert.equal(await client.request("/api/v1/packages"), "plain text");
  assert.equal(await client.request("/api/v1/packages"), null);
  await assert.rejects(client.request("/api/v1/packages"), /invalid JSON/);
});

test("network and abort failures never return mock success", async () => {
  const client = createCatalogueClient({
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(client.request("/api/v1/packages"), (error) => error.kind === "network");
  const abortError = new DOMException("Cancelled", "AbortError");
  const aborted = createCatalogueClient({
    fetchImpl: async () => {
      throw abortError;
    },
  });
  await assert.rejects(aborted.request("/api/v1/packages"), (error) => error === abortError);
});

test("configuration rejects credential-bearing and invalid API URLs", () => {
  for (const baseUrl of [
    "https://user:secret@example.test",
    "//example.test",
    "https://example.test?token=x",
    "/api?token=x",
    "file:///tmp/data",
  ])
    assert.throws(() => createCatalogueClient({ baseUrl }));
  assert.throws(() => createCatalogueClient({ credentials: "always" }));
});
