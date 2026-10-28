import assert from "node:assert/strict";
import { test } from "node:test";
import {
  projectWorkUnitStatusValues,
  readWorkUnitStatusFilterValues,
} from "./workUnitStatusProjection.js";

test("projects simple status and falls back when package state is absent or empty", () => {
  assert.deepEqual(projectWorkUnitStatusValues({ representativeStatus: 2 }), [2]);
  assert.deepEqual(projectWorkUnitStatusValues({ representativeStatus: "R", workUnitStatus: {} }), [
    "R",
  ]);
  assert.deepEqual(projectWorkUnitStatusValues({ representativeStatus: undefined }), [undefined]);
  assert.deepEqual(
    projectWorkUnitStatusValues({
      representativeStatus: null,
      workUnitStatus: { members: [{ key: "absent" }] },
    }),
    [null]
  );
});

test("projects workflow and arbitrary members in order without inventing absent values", () => {
  assert.deepEqual(
    projectWorkUnitStatusValues({
      representativeStatus: "representative",
      workUnitStatus: { workflowStatus: "W" },
    }),
    ["W"]
  );
  assert.deepEqual(
    projectWorkUnitStatusValues({
      workUnitStatus: {
        members: [
          { key: "alpha", status: "A" },
          { key: "beta", status: "B" },
        ],
      },
    }),
    ["A", "B"]
  );
  assert.deepEqual(
    projectWorkUnitStatusValues({
      workUnitStatus: {
        workflowStatus: "W",
        members: [
          { key: "first", status: "A" },
          { key: "second", status: "W" },
          { key: "third", status: "A" },
          { key: "missing" },
          { key: "empty", status: "" },
          { key: "last", status: "B" },
        ],
      },
    }),
    ["W", "A", "B"]
  );
  assert.deepEqual(
    readWorkUnitStatusFilterValues(
      { attributes: { status: "R", workUnitStatus: { members: [{ key: "X", status: "M" }] } } },
      () => "R"
    ),
    ["M"]
  );
});
