import { createMockAssignmentAdapter } from "../mock/mockAssignmentAdapter.js";
import { createFeatureService } from "../../features/services/featureService.js";
import { createWorkStreamService } from "../../workStreams/services/workStreamService.js";
import { featureIndex } from "../../features/mock/mockFeatures.js";

export function createPrototypeServices({
  storage,
  delayMs = 280,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  workStreamCatalogue,
  clock,
  createId,
} = {}) {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }

  const failures = new Set();

  async function run(operation, action) {
    const fail = failures.delete(operation) || (operation !== "save" && failures.delete("load"));
    await wait(delayMs);
    if (fail) throw new Error(`Simulated ${operation} failure. Retry when ready.`);
    return action();
  }

  const adapter = createMockAssignmentAdapter({ storage, clock, createId });
  const workStreams = createWorkStreamService({ run, catalogue: workStreamCatalogue });

  return {
    features: createFeatureService({ run, assignments: adapter }),
    workStreams,
    assignments: {
      load(id) {
        return run("assignments", () => {
          featureIndex(id);
          return adapter.load(id);
        });
      },
      save(id, draft) {
        const payload = structuredClone(draft);
        return run("save", () => {
          featureIndex(id);
          if (
            [...payload.activeIds, ...payload.comments.map((comment) => comment.workStreamId)].some(
              (workStreamId) => !workStreams.has(workStreamId)
            )
          ) {
            throw new Error("Work stream was not found.");
          }
          return adapter.save(id, payload);
        });
      },
      reset() {
        return run("reset", () => adapter.reset());
      },
    },
    testing: {
      failNext(operation) {
        failures.add(operation);
      },
    },
  };
}
