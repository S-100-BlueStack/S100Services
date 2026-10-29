function bindingRecord(bindings) {
  return {
    relations: Object.fromEntries(
      bindings.map((binding) => [
        binding.pipelineId,
        {
          active: true,
          comments: [],
          bindingId: binding.id,
          workspaces: binding.workspaces,
        },
      ])
    ),
  };
}

export class BindingSaveError extends Error {
  constructor(message, { record = null, outcomes = [] } = {}) {
    super(message);
    this.name = "BindingSaveError";
    this.record = record;
    this.outcomes = outcomes;
  }
}

export function createLiveAssignmentServices(catalogue) {
  const pending = new Map();
  const assignments = {
    async load(id, options) {
      return bindingRecord(await catalogue.bindings(id, options));
    },
    save(id, draft) {
      if (pending.has(id)) return pending.get(id);
      const desired = [...new Set(draft.activeIds)];
      const operation = saveBindings(id, desired, draft.comments).finally(() => pending.delete(id));
      pending.set(id, operation);
      return operation;
    },
  };

  async function saveBindings(id, desired, comments = []) {
    if (comments.length) throw new Error("Comments are available only in demo mode.");
    // Re-read before each attempt: a failed response may still have committed a mutation.
    const existing = await catalogue.bindings(id);
    const current = new Set(existing.map((binding) => binding.pipelineId));
    const changes = [
      ...desired
        .filter((pipelineId) => !current.has(pipelineId))
        .map((pipelineId) => ({
          pipelineId,
          action: "Add",
          run: () => catalogue.bind(id, pipelineId),
        })),
      ...existing
        .filter((binding) => !desired.includes(binding.pipelineId))
        .map((binding) => ({
          pipelineId: binding.pipelineId,
          action: "Remove",
          run: () => catalogue.unbind(binding.id),
        })),
    ];
    const outcomes = [];
    // Mutations are deliberately not aborted on navigation: abort cannot roll back a server write.
    for (const change of changes) {
      try {
        await change.run();
        outcomes.push({ pipelineId: change.pipelineId, action: change.action, ok: true });
      } catch (error) {
        outcomes.push({
          pipelineId: change.pipelineId,
          action: change.action,
          ok: false,
          message: error.message,
        });
      }
    }
    const summary = outcomes
      .map(
        (item) =>
          `${item.action} ${item.pipelineId}: ${item.ok ? "succeeded" : `failed (${item.message})`}`
      )
      .join("; ");
    let record;
    try {
      record = await assignments.load(id);
    } catch (error) {
      throw new BindingSaveError(
        `${summary ? `${summary}. ` : ""}Authoritative reload failed: ${error.message} Save again to reconcile before retrying changes.`,
        { outcomes }
      );
    }
    const actual = Object.keys(record.relations).sort();
    const matches = JSON.stringify(actual) === JSON.stringify([...desired].sort());
    if (outcomes.some((item) => !item.ok) || !matches) {
      throw new BindingSaveError(
        `${summary}. Bindings reloaded.${matches ? " Requested bindings are now present." : " Requested changes remain in the draft; review and retry."}`,
        { record, outcomes }
      );
    }
    return { ...record, saveMessage: summary || "Bindings reloaded; no changes required." };
  }

  return {
    source: "live",
    categories: catalogue.categories,
    features: {
      async search({ page = 0, pageSize = 25, type = "", status = "", search = "", signal } = {}) {
        if (search) throw new Error("Package name search is not supported by the v1 API.");
        const result = await catalogue.packages({
          page,
          pageSize,
          category: type,
          hasPipeline: status ? status === "Assigned" : undefined,
          signal,
        });
        return {
          ...result,
          items: result.items.map((item) => ({
            ...item,
            type: item.category,
            status: status || "Select to view bindings",
          })),
        };
      },
      async get(id, options) {
        const item = await catalogue.package(id, options);
        return { ...item, type: item.category };
      },
    },
    workStreams: {
      async list({ ids = null, signal } = {}) {
        const pipelines = await catalogue.pipelines({ signal });
        const items = ids === null ? pipelines : pipelines.filter((item) => ids.includes(item.id));
        return { items, total: items.length };
      },
    },
    assignments,
  };
}
