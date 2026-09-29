import { applyDraft, assignmentStatus } from "../domain/assignmentDraft.js";

export const STORAGE_KEY = "data-catalogue:feature-work-stream-prototype:v1";

const SEEDED_RELATIONS = Object.freeze({
  "feature-4": Object.freeze({
    DK1: Object.freeze({
      active: true,
      comments: Object.freeze([
        Object.freeze({
          id: "seed-comment-feature-4-dk1-1",
          text: "Initial review confirmed that this Feature belongs in DK1.",
          author: "Prototype reviewer",
          createdAt: "2026-09-18T08:15:00.000Z",
        }),
        Object.freeze({
          id: "seed-comment-feature-4-dk1-2",
          text: "Follow-up review retained the DK1 assignment for comparison.",
          author: "Prototype reviewer",
          createdAt: "2026-09-19T13:40:00.000Z",
        }),
      ]),
    }),
  }),
  "feature-5": Object.freeze({
    DK2: Object.freeze({
      active: false,
      comments: Object.freeze([
        Object.freeze({
          id: "seed-comment-feature-5-dk2-1",
          text: "Historical DK2 review retained after the assignment was removed.",
          author: "Prototype reviewer",
          createdAt: "2026-09-17T09:05:00.000Z",
        }),
        Object.freeze({
          id: "seed-comment-feature-5-dk2-2",
          text: "The inactive history remains available for a future reassignment decision.",
          author: "Prototype reviewer",
          createdAt: "2026-09-20T11:25:00.000Z",
        }),
      ]),
    }),
  }),
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function storageError() {
  return new Error(
    "Mock storage is unavailable or invalid. Allow local storage, or use Reset mock data to clear this prototype only."
  );
}

function defaultRelations(featureId) {
  const seeded = SEEDED_RELATIONS[featureId];
  if (seeded) return structuredClone(seeded);

  // Seed a small, predictable assigned subset without storing the catalogue.
  return Number(featureId.split("-")[1]) % 4 === 0 ? { DK1: { active: true, comments: [] } } : {};
}

export function createMockAssignmentAdapter({
  storage,
  clock = () => new Date().toISOString(),
  createId = () => crypto.randomUUID(),
} = {}) {
  function read() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, records: {} };

      const value = JSON.parse(raw);
      if (!isRecord(value) || value.version !== 1 || !isRecord(value.records)) {
        throw storageError();
      }

      for (const [featureId, record] of Object.entries(value.records)) {
        if (!isRecord(record) || record.featureId !== featureId || !isRecord(record.relations)) {
          throw storageError();
        }

        for (const relation of Object.values(record.relations)) {
          if (
            !isRecord(relation) ||
            typeof relation.active !== "boolean" ||
            !Array.isArray(relation.comments)
          ) {
            throw storageError();
          }

          for (const comment of relation.comments) {
            if (
              !isRecord(comment) ||
              ![comment.id, comment.text, comment.author, comment.createdAt].every(
                (value) => typeof value === "string"
              )
            ) {
              throw storageError();
            }
          }
        }
      }

      return value;
    } catch {
      throw storageError();
    }
  }

  function initial(featureId) {
    return { featureId, relations: defaultRelations(featureId) };
  }

  return {
    load(featureId) {
      return structuredClone(read().records[featureId] ?? initial(featureId));
    },
    statuses() {
      const data = read();
      return (featureId) => assignmentStatus(data.records[featureId] ?? initial(featureId));
    },
    save(featureId, draft) {
      const data = read();
      const next = applyDraft(data.records[featureId] ?? initial(featureId), draft, {
        author: "Prototype user",
        createdAt: clock(),
        createId,
      });
      data.records[featureId] = next;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        throw storageError();
      }
      return structuredClone(next);
    },
    reset() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        throw storageError();
      }
    },
  };
}
