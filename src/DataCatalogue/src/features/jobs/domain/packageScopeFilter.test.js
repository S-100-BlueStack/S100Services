import assert from "node:assert/strict";
import test from "node:test";
import {
  countOpenJobsByWorkspace,
  filterJobsByPackageScope,
  getVisiblePackageIdsForScope,
  filterWorkspacesByPackageScope,
  groupJobsByPackage,
  normalizePackageScope,
  packageWorkspaceKey,
} from "./packageScopeFilter.js";

const jobs = [
  {
    id: "a:enc:east",
    source: "live",
    packageId: "a",
    pipelineId: "enc",
    workspaceId: "east",
    status: "todo",
  },
  {
    id: "a:enc:west",
    source: "live",
    packageId: "a",
    pipelineId: "enc",
    workspaceId: "west",
    status: "done",
  },
  {
    id: "a:paper:north",
    source: "live",
    packageId: "a",
    pipelineId: "paper",
    workspaceId: "north",
    status: "todo",
  },
  {
    id: "b:paper:north",
    source: "live",
    packageId: "b",
    pipelineId: "paper",
    workspaceId: "north",
    status: "noUpdate",
  },
];

test("multi-Pipeline scope narrows contextual Jobs without conflating status", () => {
  assert.deepEqual(filterJobsByPackageScope(jobs, null), jobs);
  const workspaceKeys = [packageWorkspaceKey(jobs[0]), packageWorkspaceKey(jobs[2])];
  assert.deepEqual(
    filterJobsByPackageScope(jobs, {
      pipelineIds: ["enc", "paper"],
      workspaceKeys,
    }),
    [jobs[0], jobs[2], jobs[3]]
  );
  assert.deepEqual(filterJobsByPackageScope(jobs, { pipelineIds: [], workspaceKeys: null }), []);
  assert.deepEqual(filterJobsByPackageScope(jobs, { pipelineId: "enc", workspaceId: "west" }), [
    jobs[1],
  ]);
  assert.deepEqual(
    normalizePackageScope({ pipelineIds: ["enc", "enc"], workspaceKeys: null }).pipelineIds,
    ["enc"]
  );
});

test("Workspace map visibility follows the same context keys", () => {
  const workspaces = [
    { pipelineId: "enc", workspaceId: "east" },
    { pipelineId: "enc", workspaceId: "west" },
    { pipelineId: "paper", workspaceId: "north" },
  ];
  const scope = {
    pipelineIds: ["enc", "paper"],
    workspaceKeys: [packageWorkspaceKey(workspaces[1])],
  };
  assert.deepEqual(filterWorkspacesByPackageScope(workspaces, scope), [workspaces[1]]);
  assert.deepEqual(
    filterWorkspacesByPackageScope(workspaces, { pipelineIds: ["enc"], workspaceKeys: null }),
    workspaces.slice(0, 2)
  );
  const counts = new Map([[packageWorkspaceKey(workspaces[1]), 2]]);
  assert.deepEqual(
    filterWorkspacesByPackageScope(
      workspaces,
      { pipelineIds: ["enc"], workspaceKeys: null },
      counts
    ),
    [workspaces[1]]
  );
  assert.deepEqual(
    filterWorkspacesByPackageScope(
      workspaces,
      { pipelineIds: ["enc"], workspaceKeys: null, showEmptyWorkspaces: true },
      counts
    ),
    workspaces.slice(0, 2)
  );
  assert.deepEqual(
    filterWorkspacesByPackageScope(
      workspaces,
      {
        pipelineIds: ["enc"],
        workspaceKeys: [packageWorkspaceKey(workspaces[0])],
      },
      counts
    ),
    [workspaces[0]],
    "an explicitly selected empty Workspace stays visible"
  );
});

test("count open Jobs per Workspace with dedup and terminal-status exclusion", () => {
  const counts = countOpenJobsByWorkspace([...jobs, jobs[0]]);
  assert.equal(counts.get(packageWorkspaceKey(jobs[0])), 1);
  assert.equal(counts.get(packageWorkspaceKey(jobs[1])) ?? 0, 0);
  assert.equal(counts.get(packageWorkspaceKey(jobs[2])), 1);
});

test("one Package groups contextual Jobs while retaining their own identities", () => {
  const groups = groupJobsByPackage(jobs);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].jobs, jobs.slice(0, 3));
  assert.deepEqual(groups[1].jobs, [jobs[3]]);
  assert.equal(
    groupJobsByPackage([
      { id: "x", source: "mock" },
      { id: "y", source: "mock" },
    ]).length,
    2
  );
});

test("AOI overview excludes Pipeline-only Packages outside every Workspace", () => {
  const scope = { pipelineIds: ["enc", "paper"], workspaceKeys: null };
  // A package missing from the Workspace membership reads does not become a
  // contextual Job, even when the geometry endpoint returns it.
  assert.deepEqual(getVisiblePackageIdsForScope(jobs, scope), ["a", "b"]);
  assert.deepEqual(
    getVisiblePackageIdsForScope(jobs, {
      pipelineIds: ["enc"],
      workspaceKeys: [packageWorkspaceKey(jobs[1])],
    }),
    ["a"],
    "terminal statuses still have a valid Workspace membership"
  );
  assert.deepEqual(
    getVisiblePackageIdsForScope(jobs, {
      pipelineIds: ["paper"],
      workspaceKeys: [packageWorkspaceKey(jobs[1])],
    }),
    [],
    "a Workspace outside the selected Pipeline cannot surface a Package AOI"
  );
  assert.deepEqual(
    getVisiblePackageIdsForScope([], scope),
    [],
    "an unverified membership read must not allow all Pipeline geometry to render"
  );
});
