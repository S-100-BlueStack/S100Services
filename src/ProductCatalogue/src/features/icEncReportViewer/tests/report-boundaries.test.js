import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { fetchIcEncReportBytes } from "../api/icEncReportApi.js";
import { getIcEncReportArtifact } from "../domain/icEncReportArtifact.js";
import { createIcEncReportPresentation } from "../domain/icEncReportPresentation.js";
import { parseReportXml } from "../domain/reportXml.js";
import {
  DOCUMENT_PART,
  inspectReportZip,
  readReportZipPart,
  RELATIONSHIPS_PART,
  TYPES_PART,
} from "../domain/reportZip.js";

const id = "12345678-1234-1234-1234-123456789abc";
const url = `/electronicproducts/SAMPLE57/artifacts/${id}`;
const artifact = {
  id,
  kind: "IcEncReport",
  datasetName: "SAMPLE57",
  fileName: "synthetic.DOC",
  originalReportUrl: url,
  url,
};

test("preview identity requires a typed artifact, both owners and the selected API route", () => {
  assert.equal(getIcEncReportArtifact(artifact, "sample57", url)?.id, id);
  assert.equal(
    getIcEncReportArtifact({ ...artifact, fileName: "synthetic.docx" }, "SAMPLE57", url)?.id,
    id
  );
  for (const changes of [
    { kind: undefined },
    { kind: "ValidationReport" },
    { datasetName: "Other" },
    { datasetName: null },
    { originalReportUrl: undefined },
    { originalReportUrl: `https://example.invalid${url}` },
    { originalReportUrl: `/elsewhere${url}` },
    { id: "22345678-1234-1234-1234-123456789abc" },
  ]) {
    assert.equal(getIcEncReportArtifact({ ...artifact, ...changes }, "SAMPLE57", url), null);
  }
  for (const path of [
    `//example.invalid${url}`,
    `https://example.invalid${url}`,
    `/prefix${url}`,
    `${url}?query=1`,
    url.replace("SAMPLE57", "%2e%2e"),
    url.replace("SAMPLE57", "%252e"),
    url.replace("SAMPLE57", "SAMPLE%ab57"),
    url.replace("SAMPLE57", "SAMPLE%2f57"),
    url.replace("SAMPLE57", "SAMPLE%5c57"),
  ]) {
    assert.equal(
      getIcEncReportArtifact({ ...artifact, url: path, originalReportUrl: path }, "SAMPLE57", path),
      null
    );
  }
  assert.equal(getIcEncReportArtifact(artifact, "Other", url), null);
  assert.equal(getIcEncReportArtifact(artifact, "SAMPLE57", "/wrong"), null);
});

test("HTTP reader bounds actual decoded bytes with missing or false length", async () => {
  for (const length of [undefined, "4", "nonsense", "4000"]) {
    let reads = 0;
    let cancelled = false;
    const headers = length === undefined ? {} : { "content-length": length };
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(3));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers }
    );
    await assert.rejects(
      fetchIcEncReportBytes(artifact, {
        maxBytes: 5,
        request: async (path, options) => {
          assert.equal(path, url);
          assert.equal(options.credentials, "include");
          assert.equal(options.redirect, "error");
          return response;
        },
      }),
      /too large/
    );
    assert.ok(cancelled);
    assert.ok(reads < 4);
    assert.equal(response.body.locked, false);
  }

  const bytes = await fetchIcEncReportBytes(artifact, {
    maxBytes: 3,
    request: async () => new Response(new Uint8Array([5, 6, 7])),
  });
  assert.deepEqual([...bytes], [5, 6, 7]);
});

test("HTTP reader cancels a stalled body and never requests an unverified URL", async () => {
  let requests = 0;
  const controller = new AbortController();
  let cancelled = false;
  const request = async () => {
    requests++;
    return new Response(
      new ReadableStream({
        pull() {},
        cancel() {
          cancelled = true;
        },
      })
    );
  };
  await assert.rejects(fetchIcEncReportBytes({ ...artifact, kind: undefined }, { request }));
  assert.equal(requests, 0);
  const pending = fetchIcEncReportBytes(artifact, { request, signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(requests, 1);
  assert.ok(cancelled);
});

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));
const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);

test("ZIP preflight accepts both synthetic packages and rejects malformed metadata", async () => {
  const raw = await fixture("synthetic-real-layout.DOC");
  for (const bytes of [raw, await fixture("synthetic-simulation.DOC")]) {
    const parts = inspectReportZip(bytes);
    for (const name of [TYPES_PART, RELATIONSHIPS_PART, DOCUMENT_PART]) assert.ok(parts.has(name));
  }
  assert.throws(() => inspectReportZip(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])));
  assert.throws(() => inspectReportZip(raw.subarray(0, raw.length - 1)));

  const central = raw.indexOf(centralSignature);
  const local = raw.readUInt32LE(central + 42);
  for (const mutate of [
    (bytes) => bytes.writeUInt16LE(1, central + 8),
    (bytes) => bytes.writeUInt16LE(99, central + 10),
    (bytes) => bytes.writeUInt32LE(0xffffffff, central + 24),
    (bytes) => bytes.writeUInt32LE(bytes.length, central + 42),
    (bytes) => bytes.writeUInt16LE(257, bytes.length - 22 + 10),
    (bytes) => {
      bytes.write("../", central + 46, "ascii");
      bytes.write("../", local + 30, "ascii");
    },
    (bytes) => {
      bytes[central + 46] = "X".charCodeAt(0);
      bytes[local + 30] = "X".charCodeAt(0);
    },
  ]) {
    const bytes = Buffer.from(raw);
    mutate(bytes);
    assert.throws(() => inspectReportZip(bytes));
  }

  const first = raw.indexOf(centralSignature);
  const records = [];
  for (let cursor = first; cursor < raw.length - 22; ) {
    const size = raw.readUInt16LE(cursor + 28);
    const offset = raw.readUInt32LE(cursor + 42);
    records.push({ cursor, size, offset });
    cursor += 46 + size + raw.readUInt16LE(cursor + 30) + raw.readUInt16LE(cursor + 32);
  }
  const doc = records.find(({ cursor }) =>
    raw.toString("ascii", cursor + 46).startsWith(DOCUMENT_PART)
  );
  const bytes = Buffer.from(raw);
  // A case-conflicting duplicate other than the supported parts must also fail.
  const header = records[4];
  const footer = records[5];
  assert.equal(header.size, footer.size);
  const name = bytes.toString("ascii", header.cursor + 46, header.cursor + 46 + header.size);
  bytes.write(name.toUpperCase(), footer.cursor + 46, "ascii");
  bytes.write(name.toUpperCase(), footer.offset + 30, "ascii");
  assert.throws(() => inspectReportZip(bytes));

  const oversized = Buffer.from(raw);
  oversized.writeUInt32LE(2 * 1024 * 1024 + 1, doc.cursor + 24);
  oversized.writeUInt32LE(2 * 1024 * 1024 + 1, doc.offset + 22);
  assert.throws(() => inspectReportZip(oversized));
});

test("ZIP output writer enforces the actual byte count and cancellation", async () => {
  function entryFor(chunks) {
    return {
      uncompressedSize: 6,
      compressedSize: 4,
      async getData(output, options) {
        assert.equal(options.useWebWorkers, false);
        assert.equal(options.checkSignature, true);
        const writer = output.getWriter();
        try {
          for (const chunk of chunks) await writer.write(new Uint8Array(chunk));
        } finally {
          writer.releaseLock();
        }
      },
    };
  }
  const metadata = { size: 6, compressed: 4 };
  const complete = await readReportZipPart(entryFor([2, 4]), metadata);
  assert.equal(complete.byteLength, 6);
  await assert.rejects(readReportZipPart(entryFor([4, 3]), metadata));
  await assert.rejects(readReportZipPart(entryFor([4]), metadata));
  await assert.rejects(readReportZipPart(entryFor([6]), metadata, AbortSignal.abort()), {
    name: "AbortError",
  });
});

test("unsafe XML encodings, DTD and declarations are rejected before calling native DOMParser", () => {
  for (const bytes of [
    Buffer.from("<!DOCTYPE a [<!ENTITY e SYSTEM 'https://example.invalid/'>]><a>&e;</a>"),
    Buffer.from("<!ENTITY e 'text'><a/>"),
    Buffer.from('<?xml version="1.0" encoding="UTF-16"?><a/>'),
    Buffer.from("<!DOCTYPE a><a/>", "utf16le"),
    Buffer.from([0xff, 0xfe, 0x3c, 0]),
    Buffer.from("<a>" + "<b/>".repeat(40001) + "</a>"),
  ]) {
    assert.throws(
      () => parseReportXml(bytes),
      (error) => !(error instanceof ReferenceError)
    );
  }
});

test("the presentation preserves unfamiliar text and withholds conflicting metadata", () => {
  const texts = [
    "Cell Name – A",
    "Cell Name - B",
    "Date Received - 02/03/04",
    "Validation Conclusion",
    "Accepted for distribution",
    "Additional notes",
    "ERROR <empty> </Message>",
    "Repeated warning",
    "Repeated warning",
  ];
  const report = createIcEncReportPresentation({
    blocks: texts.map((text) => ({ type: "paragraph", text })),
    partial: false,
  });
  assert.deepEqual(
    report.blocks.map((block) => block.text),
    texts
  );
  assert.deepEqual(report.metadata, [{ label: "Date received", value: "02/03/04" }]);
  assert.equal(report.blocks[3].type, "heading");
  assert.equal(report.blocks[4].type, "paragraph");
  assert.deepEqual(Object.keys(report), ["blocks", "metadata", "partial"]);
});
