import test from "node:test";
import assert from "node:assert/strict";
import { createPackageGeometrySource } from "./createPackageGeometrySource.js";

const data = { aoi: null, detailedGeometry: null };

test("Package source reads a single selected Package and forwards caller cancellation", async () => {
  const abort = new AbortController();
  const seen = [];
  const source = createPackageGeometrySource({
    catalogue: {
      packageGeometry: async (id, options) => {
        seen.push([id, options]);
        return data;
      },
    },
  });
  assert.deepEqual(await source.load("P", { signal: abort.signal }), data);
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], "P");
  assert.equal(seen[0][1].signal.aborted, false);
  abort.abort();
  assert.equal(seen[0][1].signal.aborted, true);
  await assert.rejects(source.load("P", { signal: abort.signal }), /abort/i);
});

test("Package source has a bounded deadline for a nonsettling geometry read", async () => {
  const source = createPackageGeometrySource({
    catalogue: {
      async packageGeometry(_id, { signal }) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            {
              once: true,
            }
          );
        });
      },
    },
    requestTimeoutMs: 15,
  });
  await assert.rejects(source.load("P"), /timed out/);
});

test("Package source keeps 401/403/404/500 errors as errors", async () => {
  const source = createPackageGeometrySource({
    catalogue: {
      packageGeometry: async () => {
        throw new Error("Forbidden (403)");
      },
    },
  });
  await assert.rejects(source.load("P"), /403/);
  assert.throws(() => createPackageGeometrySource({ catalogue: {} }), /unavailable/);
  assert.throws(
    () => createPackageGeometrySource({ catalogue: { packageGeometry() {} }, requestTimeoutMs: 0 }),
    /positive/
  );
});
