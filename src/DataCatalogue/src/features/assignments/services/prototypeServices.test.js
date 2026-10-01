import test from "node:test";
import assert from "node:assert/strict";
import { createPrototypeServices } from "./createPrototypeServices.js";
import { STORAGE_KEY } from "../mock/mockAssignmentAdapter.js";
import { createDraft, assignmentStatus } from "../domain/assignmentDraft.js";
function fixture(options = {}) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  return {
    values,
    storage,
    services: createPrototypeServices({
      storage,
      wait: async () => {},
      clock: () => "2026-09-22T12:00:00.000Z",
      createId: () => `comment-${++sequence}`,
      ...options,
    }),
  };
}
test("Feature queries combine name, type and persisted assignment status with bounded pages", async () => {
  const { services } = fixture();
  const result = await services.features.search({
    type: "NM",
    status: "Not assigned",
    search: "nm2600",
    pageSize: 7,
  });
  assert.equal(result.items.length, 7);
  assert.ok(
    result.items.every(
      (f) => f.type === "NM" && f.status === "Not assigned" && f.name.startsWith("NM2600")
    )
  );
  const next = await services.features.search({
    type: "NM",
    status: "Not assigned",
    search: "nm2600",
    pageSize: 7,
    page: 1,
  });
  assert.ok(!next.items.some((item) => result.items.some((first) => first.id === item.id)));
  assert.equal((await services.features.search()).total, 6000);
  assert.equal((await services.features.search({ pageSize: 9999 })).items.length, 100);
  assert.equal((await services.features.search({ search: "missing" })).total, 0);
  assert.ok(
    !(await services.features.search()).items.some(
      (item) => "details" in item || "geometry" in item
    )
  );
});
test("Feature names and read-only information preserve optional missing data and geometry", async () => {
  const { services } = fixture();
  const first = await services.features.get("feature-1");
  const kp = await services.features.get("feature-3001");
  assert.equal(first.name, "NM260001");
  assert.equal(kp.name, "KP260001");
  assert.equal(kp.publication, "");
  assert.equal(kp.nauticalCharts, "");
  assert.equal(first.geometry.spatialReference.wkid, 4326);
  assert.ok(first.details.length > 2000);
  await assert.rejects(services.features.get("feature-0"), /not found/);
});
test("Work stream catalogue returns the complete applicable list without pagination", async () => {
  const catalogue = Array.from({ length: 1200 }, (_, index) => ({
    id: `work-stream-${index}`,
    name: `Survey ${index}`,
    layerIds: index % 2 ? [4, 5, 6] : [],
  }));
  const { services } = fixture({ workStreamCatalogue: catalogue });
  const result = await services.workStreams.list();
  assert.equal(result.total, 1200);
  assert.equal(result.items.length, 1200);
  assert.deepEqual(result.items[1].layerIds, [4, 5, 6]);
  assert.deepEqual(result.items[0].layerIds, []);
  const selected = await services.workStreams.list({ ids: ["work-stream-1000", "work-stream-7"] });
  assert.equal(selected.total, 2);
  assert.deepEqual(
    selected.items.map((item) => item.id),
    ["work-stream-7", "work-stream-1000"]
  );
});
test("Initial Work stream geography follows DK1-DK5 bindings", async () => {
  const { services } = fixture();
  assert.deepEqual(
    (await services.workStreams.list()).items.map((w) => [w.id, w.layerIds]),
    [
      ["DK1", [4]],
      ["DK2", [5]],
      ["DK3", [6]],
      ["DK4", [7]],
      ["DK5", [8]],
    ]
  );
});
test("Show all and Show active Work stream subsets are complete without pagination", async () => {
  const { services } = fixture();
  const all = await services.workStreams.list();
  const active = await services.workStreams.list({ ids: ["DK1", "DK3"] });

  assert.deepEqual(
    all.items.map((workStream) => workStream.id),
    ["DK1", "DK2", "DK3", "DK4", "DK5"]
  );
  assert.deepEqual(
    active.items.map((workStream) => workStream.id),
    ["DK1", "DK3"]
  );
  assert.equal(active.total, 2);
  assert.equal("page" in all, false);
  assert.equal("pageSize" in all, false);
});
test("Deterministic mock fixtures expose saved Work stream history without changing assignment semantics", async () => {
  const { services } = fixture();

  const assigned = await services.assignments.load("feature-4");
  assert.equal((await services.features.get("feature-4")).name, "NM260004");
  assert.equal(assignmentStatus(assigned), "Assigned");
  assert.deepEqual(
    assigned.relations.DK1.comments.map((comment) => comment.id),
    ["seed-comment-feature-4-dk1-1", "seed-comment-feature-4-dk1-2"]
  );
  assert.deepEqual(
    assigned.relations.DK1.comments.map((comment) => comment.createdAt),
    ["2026-09-18T08:15:00.000Z", "2026-09-19T13:40:00.000Z"]
  );

  assigned.relations.DK1.comments[0].text = "External mutation";
  assert.match(
    (await services.assignments.load("feature-4")).relations.DK1.comments[0].text,
    /Initial review/
  );

  const inactiveHistory = await services.assignments.load("feature-5");
  assert.equal((await services.features.get("feature-5")).name, "NM260005");
  assert.equal(assignmentStatus(inactiveHistory), "Not assigned");
  assert.equal(inactiveHistory.relations.DK2.active, false);
  assert.equal(inactiveHistory.relations.DK2.comments.length, 2);

  const draft = createDraft(inactiveHistory);
  draft.activeIds.push("DK2");
  const reassigned = await services.assignments.save("feature-5", draft);
  assert.equal(assignmentStatus(reassigned), "Assigned");
  assert.equal(reassigned.relations.DK2.comments.length, 2);
});

test("Draft mutations remain separate until saved and assignments do not require overlap", async () => {
  const { services } = fixture();
  const record = await services.assignments.load("feature-1");
  const draft = createDraft(record);
  draft.activeIds.push("DK5");
  assert.equal(assignmentStatus(await services.assignments.load("feature-1")), "Not assigned");
  const saved = await services.assignments.save("feature-1", draft);
  assert.equal(assignmentStatus(saved), "Assigned");
  assert.equal(
    (await services.features.search({ search: "NM260001", status: "Assigned" })).total,
    1
  );
});
test("Saved comment history is immutable, retained on removal and remains with its Work stream", async () => {
  const { services } = fixture();
  let draft = createDraft(await services.assignments.load("feature-1"));
  draft.activeIds = ["DK1"];
  draft.comments = [
    { workStreamId: "DK1", text: "First observation" },
    { workStreamId: "DK1", text: "Second observation" },
  ];
  const saved = await services.assignments.save("feature-1", draft);
  saved.relations.DK1.comments[0].text = "External mutation";
  let record = await services.assignments.load("feature-1");
  assert.equal(record.relations.DK1.comments[0].text, "First observation");
  draft = createDraft(record);
  draft.activeIds = ["DK2"];
  draft.comments = [{ workStreamId: "DK2", text: "Separate history" }];
  record = await services.assignments.save("feature-1", draft);
  assert.equal(record.relations.DK1.active, false);
  assert.equal(record.relations.DK1.comments.length, 2);
  assert.equal(record.relations.DK2.comments.length, 1);
  assert.equal(assignmentStatus(record), "Assigned");
  draft = createDraft(record);
  draft.activeIds = [];
  record = await services.assignments.save("feature-1", draft);
  assert.equal(assignmentStatus(record), "Not assigned");
  assert.equal(record.relations.DK1.comments.length, 2);
  assert.equal(record.relations.DK2.comments.length, 1);
  draft = createDraft(record);
  draft.activeIds.push("DK1");
  record = await services.assignments.save("feature-1", draft);
  assert.equal(record.relations.DK1.comments.length, 2);
  assert.equal(record.relations.DK1.comments[0].author, "Prototype user");
  assert.equal(record.relations.DK1.comments[0].createdAt, "2026-09-22T12:00:00.000Z");
});
test("The adapter rejects new comments for inactive relations", async () => {
  const { services } = fixture();
  await assert.rejects(
    services.assignments.save("feature-1", {
      activeIds: [],
      comments: [{ workStreamId: "DK2", text: "Invalid" }],
    }),
    /Assign DK2 again/
  );
  assert.equal(assignmentStatus(await services.assignments.load("feature-1")), "Not assigned");
});
test("Persistence survives service recreation and reset clears only the prototype key", async () => {
  const { services, storage, values } = fixture();
  values.set("data-catalogue:theme", "dark");
  values.set("other-data", "untouched");
  await services.assignments.save("feature-1", { activeIds: ["DK3"], comments: [] });
  const reloaded = createPrototypeServices({ storage, wait: async () => {} });
  assert.equal(assignmentStatus(await reloaded.assignments.load("feature-1")), "Assigned");
  await reloaded.assignments.reset();
  assert.equal(values.has(STORAGE_KEY), false);
  assert.equal(values.get("data-catalogue:theme"), "dark");
  assert.equal(values.get("other-data"), "untouched");
  assert.equal(assignmentStatus(await services.assignments.load("feature-1")), "Not assigned");
});
test("Invalid persistence is reported and reset recovers without silent data loss", async () => {
  const { services, values } = fixture();
  values.set(STORAGE_KEY, "broken-json");
  await assert.rejects(services.assignments.load("feature-1"), /storage/);
  assert.equal(values.get(STORAGE_KEY), "broken-json");
  await services.assignments.reset();
  assert.equal(assignmentStatus(await services.assignments.load("feature-1")), "Not assigned");
});
test("Storage write failures cannot acknowledge a successful save", async () => {
  const { services } = fixture({
    storage: {
      getItem: () => null,
      setItem() {
        throw new Error("Quota exceeded");
      },
    },
  });
  await assert.rejects(
    services.assignments.save("feature-1", { activeIds: ["DK1"], comments: [] }),
    /storage/
  );
});
test("Load and save failures are deterministic, operation-specific and one-shot", async () => {
  const { services } = fixture();
  services.testing.failNext("feature");
  await services.workStreams.list();
  await assert.rejects(services.features.get("feature-1"), /Simulated feature failure/);
  await services.features.get("feature-1");
  services.testing.failNext("assignments");
  await assert.rejects(services.assignments.load("feature-1"));
  services.testing.failNext("workStreams");
  await assert.rejects(services.workStreams.list());
  services.testing.failNext("save");
  await assert.rejects(
    services.assignments.save("feature-1", { activeIds: ["DK1"], comments: [] })
  );
  assert.equal(assignmentStatus(await services.assignments.load("feature-1")), "Not assigned");
  await services.assignments.save("feature-1", { activeIds: ["DK1"], comments: [] });
});
test("Mock latency is injectable and Save snapshots the submitted draft", async () => {
  const waits = [];
  const { services } = fixture({
    wait: (ms) => new Promise((resolve) => waits.push({ ms, resolve })),
  });
  const draft = { activeIds: ["DK1"], comments: [] };
  const saving = services.assignments.save("feature-1", draft);
  draft.activeIds.push("DK2");
  assert.equal(waits[0].ms, 280);
  waits[0].resolve();
  const record = await saving;
  assert.equal(record.relations.DK2, undefined);
});
