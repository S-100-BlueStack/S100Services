import assert from "node:assert/strict";
import test from "node:test";

import { projectMemberStatusRenderState } from "./memberStatusRenderingProjection.js";

test("falls back to the representative scalar when member state is absent or empty", () => {
  assert.deepEqual(projectMemberStatusRenderState({ representativeStatus: 8 }), {
    kind: "scalar",
    status: 8,
    memberStatuses: [],
  });
  assert.deepEqual(
    projectMemberStatusRenderState({
      representativeStatus: "representative",
      workUnitStatus: { members: [] },
    }),
    {
      kind: "scalar",
      status: "representative",
      memberStatuses: [],
    }
  );
});

test("ignores workflow status when no authoritative member status is supplied", () => {
  assert.deepEqual(
    projectMemberStatusRenderState({
      representativeStatus: "representative",
      workUnitStatus: { workflowStatus: "package-paused" },
    }),
    {
      kind: "scalar",
      status: "representative",
      memberStatuses: [],
    }
  );
});

test("projects one supplied member status as scalar without inventing another member", () => {
  assert.deepEqual(
    projectMemberStatusRenderState({
      representativeStatus: "representative",
      workUnitStatus: {
        members: [{ key: "any-member", status: 11 }, { key: "missing-member" }],
      },
    }),
    {
      kind: "scalar",
      status: "11",
      memberStatuses: ["11"],
    }
  );
});

test("deduplicates equivalent scalar and string member statuses", () => {
  assert.deepEqual(
    projectMemberStatusRenderState({
      workUnitStatus: {
        members: [
          { key: "alpha", status: 8 },
          { key: "beta", status: "8" },
          { key: "gamma", status: " 8 " },
        ],
      },
    }),
    {
      kind: "scalar",
      status: "8",
      memberStatuses: ["8"],
    }
  );
});

test("detects two distinct arbitrary member statuses as mixed", () => {
  assert.deepEqual(
    projectMemberStatusRenderState({
      workUnitStatus: {
        members: [
          { key: "port", status: 8 },
          { key: "starboard", status: 11 },
        ],
      },
    }),
    {
      kind: "mixed",
      status: null,
      memberStatuses: ["11", "8"],
    }
  );
});

test("deduplicates three or more statuses and ignores empty values", () => {
  assert.deepEqual(
    projectMemberStatusRenderState({
      workUnitStatus: {
        members: [
          { key: "one", status: "" },
          { key: "two", status: "  " },
          { key: "three", status: null },
          { key: "four", status: 15 },
          { key: "five", status: 8 },
          { key: "six", status: "15" },
          { key: "seven", status: 11 },
        ],
      },
    }),
    {
      kind: "mixed",
      status: null,
      memberStatuses: ["11", "15", "8"],
    }
  );
});

test("member order does not change the semantic render state", () => {
  const first = projectMemberStatusRenderState({
    workUnitStatus: {
      members: [
        { key: "first", status: 8 },
        { key: "second", status: 11 },
      ],
    },
  });
  const second = projectMemberStatusRenderState({
    workUnitStatus: {
      members: [
        { key: "renamed-second", status: "11" },
        { key: "renamed-first", status: "8" },
      ],
    },
  });

  assert.deepEqual(second, first);
});
