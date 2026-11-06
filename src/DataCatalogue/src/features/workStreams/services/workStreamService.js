import { MOCK_WORK_STREAMS } from "../mock/mockWorkStreams.js";

export function createWorkStreamService({ run, catalogue = MOCK_WORK_STREAMS }) {
  const byId = new Map(catalogue.map((item) => [item.id, item]));

  return {
    list({ ids = null } = {}) {
      return run("workStreams", () => {
        const selected = ids === null ? null : new Set(ids);
        const items = catalogue.filter((workStream) => !selected || selected.has(workStream.id));

        return structuredClone({
          items,
          total: items.length,
        });
      });
    },
    has(id) {
      return byId.has(id);
    },
    // Only geography bindings cross the map adapter seam, never the UI catalogue.
    mapBindings() {
      return run("mapBindings", () =>
        structuredClone(catalogue.filter((workStream) => workStream.layerIds.length))
      );
    },
  };
}
