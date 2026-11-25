import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogueService } from "./catalogueService.js";
import { normalizeBindingCommentPage, trimBindingComment } from "./bindingComments.js";

const id = "00000000-0000-4000-8000-000000000001";
const item = {
  id,
  pipelineId: "enc",
  text: "First line\n<script>plain text</script>",
  actor: "PROD\\B123456",
  occurredAtUtc: "2026-11-25T10:30:45.1234567+00:00",
};
const page = { packageId: "package", items: [item], nextBefore: null };

test("comment transport uses canonical Package paths and omits actor and time", async () => {
  const calls = [];
  const service = createCatalogueService({
    request: async (path, options) => {
      calls.push([path, options]);
      return options.method === "POST" ? item : { ...page, packageId: "package/1" };
    },
  });
  const signal = new AbortController().signal;
  const opened = await service.bindingComments("package/1", { signal });
  assert.deepEqual(opened.items, [item]);
  assert.equal(calls[0][0], "/v1/packages/package%2F1/binding-comments");
  assert.deepEqual(calls[0][1], { query: { pageSize: 50, before: null }, signal });
  assert.equal(trimBindingComment(`\u0085${item.text}\u0085`), item.text);
  await service.addBindingComment(
    "package/1",
    {
      id,
      workStreamId: "enc",
      text: `\u0085${item.text}\u0085`,
      actor: "spoofed",
      occurredAtUtc: "2000-01-01T10:30:45Z",
    },
    { signal }
  );
  assert.deepEqual(calls[1], [
    calls[0][0],
    {
      method: "POST",
      body: { pipelineId: "enc", operationId: id, text: `\u0085${item.text}\u0085` },
      signal,
    },
  ]);
});

test("comment reads distinguish empty success from invalid pages", () => {
  assert.deepEqual(normalizeBindingCommentPage({ ...page, items: [] }, "package"), {
    items: [],
    nextBefore: null,
  });
  for (const invalid of [
    { ...page, packageId: "another" },
    { ...page, nextBefore: id },
    { ...page, items: [item, item] },
    { ...page, items: [{ ...item, text: " " }] },
    { ...page, items: [{ ...item, actor: null }] },
  ]) {
    assert.throws(
      () => normalizeBindingCommentPage(invalid, "package"),
      /invalid binding comments/
    );
  }
  assert.throws(() => normalizeBindingCommentPage(page, "package", id), /invalid binding comments/);
});
