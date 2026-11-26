import { hasBindingCommentText } from "../../../shared/api/bindingComments.js";
import { PACKAGE_STATUS_LABELS } from "../../../shared/api/packageComments.js";
import { readConfirmedPackageOperations } from "./packageOperationConfirmation.js";
import { collectPages } from "../../../shared/api/catalogueService.js";
import {
  BindingRequestTimeoutError,
  withBindingRequestDeadline,
} from "./withBindingRequestDeadline.js";

import { assignmentDraftError, rebaseDraftBindings } from "../domain/assignmentDraft.js";
import { confirmedBindingCommentIds } from "../domain/confirmedBindingComments.js";

const DEFAULT_BINDING_REQUEST_TIMEOUT_MS = 30_000;

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
  constructor(
    message,
    {
      record = null,
      outcomes = [],
      requiresReconciliation = false,
      commentHistory,
      confirmedCommentIds = [],
      pendingCommentIds = [],
    } = {}
  ) {
    super(message);
    this.name = "BindingSaveError";
    this.record = record;
    this.outcomes = outcomes;
    this.commentHistory = commentHistory;
    this.confirmedCommentIds = confirmedCommentIds;
    this.pendingCommentIds = pendingCommentIds;
    this.requiresReconciliation = requiresReconciliation;
  }
}

function hasUncertainOutcome(error) {
  return (
    error instanceof BindingRequestTimeoutError ||
    error?.name === "AbortError" ||
    error?.kind === "network" ||
    (Number.isInteger(error?.status) && error.status >= 500)
  );
}

function isDefiniteClientRejection(error) {
  return error?.status >= 400 && error.status < 500 && error.status !== 408;
}

export function createLiveAssignmentServices(
  catalogue,
  {
    bindingRequestTimeoutMs = DEFAULT_BINDING_REQUEST_TIMEOUT_MS,
    onMembershipInvalidated,
    onCommentsInvalidated,
  } = {}
) {
  const pending = new Map();
  const pendingCommentReads = new Map();
  const request = (stage, operation, signal) =>
    withBindingRequestDeadline(operation, {
      stage,
      timeoutMs: bindingRequestTimeoutMs,
      signal,
    });

  async function readBindings(id, signal, baselineActiveIds) {
    const bindings = await request(
      "Binding catalogue read",
      ({ signal: requestSignal }) => catalogue.bindings(id, { signal: requestSignal }),
      signal
    );
    if (Array.isArray(baselineActiveIds)) {
      const currentIds = new Set(bindings.map((binding) => binding.pipelineId));
      if (
        currentIds.size !== baselineActiveIds.length ||
        baselineActiveIds.some((pipelineId) => !currentIds.has(pipelineId))
      ) {
        onMembershipInvalidated?.();
      }
    }
    return bindings;
  }

  const supportsComments =
    typeof catalogue.bindingComments === "function" &&
    typeof catalogue.addBindingComment === "function";

  function readComments(id, signal) {
    if (pendingCommentReads.has(id)) return pendingCommentReads.get(id);
    const reading = request(
      "Binding comment history read",
      async ({ signal: requestSignal }) => {
        const comments = [];
        const seen = new Set();
        let before = null;
        do {
          requestSignal.throwIfAborted();
          const page = await catalogue.bindingComments(id, { before, signal: requestSignal });
          for (const item of page.items) {
            if (seen.has(item.id)) throw new Error("Duplicate binding comment. Reload comments.");
            seen.add(item.id);
            comments.push(item);
          }
          before = page.nextBefore;
        } while (before);
        return comments;
      },
      signal
    ).finally(() => pendingCommentReads.delete(id));
    pendingCommentReads.set(id, reading);
    return reading;
  }

  async function readCommentsWithConfirmation(id, awaiting) {
    const commentHistory = await readComments(id);
    const confirmedIds = confirmedBindingCommentIds(awaiting, commentHistory);
    const confirmedPipelines = new Set(
      awaiting
        .filter(({ id: operationId }) => confirmedIds.includes(operationId))
        .map(({ workStreamId }) => workStreamId)
    );
    for (const pipelineId of confirmedPipelines) {
      onCommentsInvalidated?.({ packageId: id, pipelineId });
    }
    return { commentHistory, confirmedIds };
  }

  const supportsPackageOperations =
    typeof catalogue.packageComments === "function" &&
    typeof catalogue.savePackageOperation === "function" &&
    typeof catalogue.packageHistory === "function";

  // Recovery is read-only. It must not repeat an unconfirmed write.
  async function reconcileBindings(
    id,
    { includeComments = false, baselineActiveIds, awaitingComments = [] } = {}
  ) {
    const bindingsRead = readBindings(id, undefined, baselineActiveIds);
    if (!includeComments) return bindingRecord(await bindingsRead);
    const [bindings, { commentHistory }] = await Promise.all([
      bindingsRead,
      readCommentsWithConfirmation(id, awaitingComments),
    ]);
    return { ...bindingRecord(bindings), commentHistory };
  }

  function readPackage(id) {
    return request("Package assignment status read", ({ signal }) =>
      catalogue.package(id, { signal })
    );
  }

  async function readStatus(id, record) {
    const current = await readPackage(id);
    const bound = Object.keys(record.relations);
    if (
      current.assignmentStatus &&
      (!Array.isArray(current.pipelineIds) ||
        current.pipelineIds.length !== bound.length ||
        !bound.every((pipelineId) => current.pipelineIds.includes(pipelineId)))
    ) {
      throw new Error(
        "Package status and Workstream bindings changed during readback. Reload saved changes."
      );
    }
    return current.assignmentStatus ?? null;
  }

  function confirmPackageOperations(id, operations) {
    return operations.length
      ? request("Package history readback", ({ signal }) =>
          readConfirmedPackageOperations(catalogue, id, operations, signal)
        )
      : Promise.resolve([]);
  }

  async function savePackageDraft(id, draft, baselineActiveIds) {
    const { activeIds, decision } = draft;
    if (decision && decision.kind !== "reopen") throw new Error("Use the direct Discard action.");
    const validation = assignmentDraftError(draft, { validateCommentText: true });
    if (validation) throw new Error(validation);
    const initial = await readPackage(id);
    const operations = decision ? [decision] : [];
    if (!initial.assignmentStatus) {
      if (operations.length) throw new Error("The API does not provide Package assignment status.");
      return saveBindings(id, activeIds, draft.comments, baselineActiveIds);
    }
    const baseline = baselineActiveIds ?? initial.pipelineIds;
    const expected = rebaseDraftBindings(initial.pipelineIds, activeIds, baseline);
    if (
      expected.length &&
      initial.assignmentStatus === "discarded" &&
      decision?.kind !== "reopen"
    ) {
      throw new Error("Reopen the Package before assigning a Workstream.");
    }

    const attempted = operations.filter((operation) => operation.awaitingConfirmation);
    const confirmed = new Set(await confirmPackageOperations(id, attempted));
    let record = null;
    async function submit(operation) {
      if (!operation || confirmed.has(operation.id)) return;
      try {
        await request("Package change", ({ signal }) =>
          catalogue.savePackageOperation(id, operation, { signal })
        );
        if (!attempted.includes(operation)) attempted.push(operation);
      } catch (error) {
        if (!isDefiniteClientRejection(error) && !attempted.includes(operation))
          attempted.push(operation);
        throw error;
      }
    }

    try {
      if (decision?.kind === "reopen") {
        await submit(decision);
        for (const operationId of await confirmPackageOperations(id, [decision]))
          confirmed.add(operationId);
        const reopenedStatus = (await readPackage(id)).assignmentStatus;
        if (!confirmed.has(decision.id) || !["notAssigned", "assigned"].includes(reopenedStatus)) {
          throw new Error("Reopen could not be confirmed. No Workstream was assigned.");
        }
      }

      const editsBindings =
        draft.comments.length ||
        baseline.length !== activeIds.length ||
        activeIds.some((pipelineId) => !baseline.includes(pipelineId));
      if (editsBindings) {
        record = await saveBindings(id, activeIds, draft.comments, baseline, true);
      } else {
        record = await reconcileBindings(id, { baselineActiveIds: baseline });
      }
      for (const operationId of await confirmPackageOperations(id, attempted))
        confirmed.add(operationId);
      record.assignmentStatus = await readStatus(id, record);
      const finalBindings = Object.keys(record.relations);
      const expectedStatus = finalBindings.length
        ? "assigned"
        : decision?.kind === "reopen" || initial.assignmentStatus !== "discarded"
          ? "notAssigned"
          : "discarded";
      if (
        record.assignmentStatus !== expectedStatus ||
        operations.some((operation) => !confirmed.has(operation.id))
      ) {
        throw new Error(
          "The requested Package changes could not be confirmed in the current saved state."
        );
      }
      return { ...record, confirmedPackageIds: [...confirmed] };
    } catch (error) {
      let current = error.record ?? record;
      let failedReadback = false;
      // If bindings are uncertain, keep their established read-only recovery barrier.
      if (!error.requiresReconciliation) {
        try {
          current ??= await reconcileBindings(id, { baselineActiveIds: baseline });
          current.assignmentStatus = await readStatus(id, current);
          for (const operationId of await confirmPackageOperations(id, attempted))
            confirmed.add(operationId);
        } catch {
          failedReadback = true;
        }
      }
      throw Object.assign(error, {
        record: current,
        confirmedPackageIds: [...confirmed],
        pendingPackageIds: attempted.map(({ id: operationId }) => operationId),
        requiresReconciliation: Boolean(
          error.requiresReconciliation ||
          failedReadback ||
          attempted.some((operation) => !confirmed.has(operation.id))
        ),
      });
    }
  }

  async function changeDecision(id, operation) {
    const isDiscard = operation.kind === "discardReason";
    const initial = await readPackage(id);
    const expected = isDiscard ? "notAssigned" : "discarded";
    const target = isDiscard ? "discarded" : "notAssigned";
    if (initial.assignmentStatus !== expected || initial.pipelineIds?.length !== 0) {
      const record = await reconcileBindings(id, { baselineActiveIds: [] });
      record.assignmentStatus = await readStatus(id, record);
      throw Object.assign(
        new Error("The Package status or bindings changed. Review the saved state."),
        { record }
      );
    }

    try {
      await request("Package decision", ({ signal }) =>
        catalogue.savePackageOperation(id, operation, { signal })
      );
    } catch (error) {
      if (!isDefiniteClientRejection(error)) {
        throw new BindingSaveError("Check saved changes before retrying the decision.", {
          requiresReconciliation: true,
        });
      }
      const record = await reconcileBindings(id, { baselineActiveIds: [] });
      record.assignmentStatus = await readStatus(id, record);
      throw Object.assign(error, { record });
    }

    let record;
    let confirmed;
    try {
      confirmed = await confirmPackageOperations(id, [operation]);
      record = await reconcileBindings(id, { baselineActiveIds: [] });
      record.assignmentStatus = await readStatus(id, record);
    } catch {
      throw new BindingSaveError("Check saved changes before retrying the decision.", {
        requiresReconciliation: true,
      });
    }
    if (!confirmed.includes(operation.id)) {
      throw new BindingSaveError("The decision is not yet visible. Check saved changes.", {
        record,
        requiresReconciliation: true,
      });
    }
    if (record.assignmentStatus !== target) {
      throw Object.assign(
        new Error("The decision was recorded, but the Package status has since changed."),
        {
          record,
          confirmedPackageIds: confirmed,
        }
      );
    }
    return { record, confirmedPackageIds: confirmed };
  }

  const assignments = {
    ...(supportsComments
      ? { loadComments: (id, { signal } = {}) => readComments(id, signal) }
      : {}),
    async load(id, { signal } = {}) {
      return bindingRecord(await readBindings(id, signal));
    },
    ...(supportsPackageOperations
      ? {
          packageComments: catalogue.packageComments,
          packageProfile: catalogue.packageHistoryProfile,
          changeDecision(id, operation) {
            if (
              !["discardReason", "reopen"].includes(operation.kind) ||
              (operation.kind === "discardReason" && !hasBindingCommentText(operation.text))
            ) {
              return Promise.reject(new Error("Enter a valid discard reason."));
            }
            if (pending.has(id))
              return Promise.reject(new Error("A Package mutation is already running."));
            const running = changeDecision(id, operation).finally(() => pending.delete(id));
            pending.set(id, running);
            return running;
          },
        }
      : {}),
    async reconcile(id, options = {}) {
      if (!supportsPackageOperations) return reconcileBindings(id, options);
      const { awaitingPackageOperations = [] } = options;
      const [record, confirmedPackageIds] = await Promise.all([
        reconcileBindings(id, options),
        confirmPackageOperations(id, awaitingPackageOperations),
      ]);
      return {
        ...record,
        assignmentStatus: await readStatus(id, record),
        confirmedPackageIds,
      };
    },
    save(id, draft, { baselineActiveIds } = {}) {
      // Reject old/foreign Workspace edit payloads before any binding reads or writes.
      if (Object.hasOwn(draft, "workspaceOverrides"))
        return Promise.reject(
          new Error("Manual Workspace assignments are not supported by this API.")
        );
      if (pending.has(id)) return pending.get(id);
      const desired = [...new Set(draft.activeIds)];
      const operation = (
        supportsPackageOperations
          ? savePackageDraft(id, { ...draft, activeIds: desired }, baselineActiveIds)
          : saveBindings(id, desired, draft.comments, baselineActiveIds)
      ).finally(() => pending.delete(id));
      pending.set(id, operation);
      return operation;
    },
  };

  async function saveBindings(id, intendedIds, comments = [], baselineActiveIds, rebase = false) {
    if (comments.length && !supportsComments)
      throw new Error("Binding comments cannot be saved by this API.");
    if (comments.length && !Array.isArray(baselineActiveIds))
      throw new Error("Reload the saved Workstream assignments before adding comments.");
    const validationError = assignmentDraftError(
      { activeIds: intendedIds, comments },
      { validateCommentText: true }
    );
    if (validationError) throw new Error(validationError);
    // Preflight is always authoritative. A previous unsuccessful response may have committed.
    const [existing, { commentHistory: priorComments, confirmedIds: alreadyConfirmed }] =
      await Promise.all([
        readBindings(id, undefined, baselineActiveIds),
        comments.length
          ? readCommentsWithConfirmation(
              id,
              comments.filter((comment) => comment.awaitingConfirmation)
            )
          : { commentHistory: [], confirmedIds: [] },
      ]);
    const priorConfirmation = alreadyConfirmed.length
      ? { commentHistory: priorComments, confirmedCommentIds: alreadyConfirmed }
      : {};
    const toAppend = comments.filter((comment) => !alreadyConfirmed.includes(comment.id));
    const currentIds = existing.map((binding) => binding.pipelineId);
    const current = new Set(currentIds);
    const desired =
      comments.length || rebase
        ? rebaseDraftBindings(currentIds, intendedIds, baselineActiveIds)
        : intendedIds;
    const changes = [
      ...desired
        .filter((pipelineId) => !current.has(pipelineId))
        .map((pipelineId) => ({
          pipelineId,
          action: "Add",
          run: (signal) => catalogue.bind(id, pipelineId, { signal }),
        })),
      ...existing
        .filter((binding) => !desired.includes(binding.pipelineId))
        .map((binding) => ({
          pipelineId: binding.pipelineId,
          action: "Remove",
          run: (signal) => catalogue.unbind(binding.id, { signal }),
        })),
    ];
    const outcomes = [];
    let successfulWrites = 0;

    // Preserve independent 4xx failures, but stop on uncertain transport/server outcomes.
    // Continuing the batch after a timed-out write could silently duplicate or undo it.
    for (const change of changes) {
      try {
        await request(`Binding ${change.action.toLowerCase()}`, ({ signal }) => change.run(signal));
        successfulWrites++;
        onMembershipInvalidated?.();
        outcomes.push({ pipelineId: change.pipelineId, action: change.action, ok: true });
      } catch (error) {
        // An interrupted or invalid response can follow a committed write. A
        // definite client rejection does not require a membership refresh.
        const uncertain = hasUncertainOutcome(error);
        if (uncertain || !isDefiniteClientRejection(error)) onMembershipInvalidated?.();
        outcomes.push({
          pipelineId: change.pipelineId,
          action: change.action,
          ok: false,
          message: error.message,
        });
        if (uncertain) {
          throw new BindingSaveError(
            `${change.action} ${change.pipelineId}: ${error.message} The server outcome is unknown. Check saved bindings before another Save. No remaining changes were sent.`,
            { outcomes, requiresReconciliation: true, ...priorConfirmation }
          );
        }
      }
    }

    const accepted = [];
    if (toAppend.length) {
      let active;
      try {
        const bindings = successfulWrites ? await readBindings(id) : existing;
        active = new Set(bindings.map((binding) => binding.pipelineId));
      } catch (error) {
        throw new BindingSaveError(
          `Could not verify active bindings before adding comments. ${error.message}`,
          { outcomes, requiresReconciliation: true, ...priorConfirmation }
        );
      }
      for (const comment of toAppend) {
        const outcome = { pipelineId: comment.workStreamId, action: "Comment", ok: false };
        outcomes.push(outcome);
        if (!active.has(comment.workStreamId)) {
          outcome.message = "The binding is not confirmed active.";
          continue;
        }
        try {
          await request("Binding comment append", ({ signal }) =>
            catalogue.addBindingComment(id, comment, { signal })
          );
          successfulWrites++;
          onCommentsInvalidated?.({ packageId: id, pipelineId: comment.workStreamId });
          accepted.push(comment);
          outcome.ok = true;
        } catch (error) {
          outcome.message = error.message;
          // An invalid or interrupted success response also leaves the append uncertain.
          if (hasUncertainOutcome(error) || !isDefiniteClientRejection(error)) {
            onCommentsInvalidated?.({ packageId: id, pipelineId: comment.workStreamId });
            throw new BindingSaveError(
              `Comment ${comment.workStreamId}: ${error.message} Check saved changes before another Save. No remaining changes were sent.`,
              {
                outcomes,
                requiresReconciliation: true,
                ...priorConfirmation,
                pendingCommentIds: [...accepted, comment].map((draft) => draft.id),
              }
            );
          }
        }
      }
    }

    const summary = outcomes
      .map((item) => {
        const status = item.ok
          ? item.action === "Comment"
            ? "accepted by the API"
            : "succeeded"
          : `failed (${item.message})`;
        return `${item.action} ${item.pipelineId}: ${status}`;
      })
      .join("; ");
    let record;
    try {
      record = await reconcileBindings(id, {
        includeComments: comments.length > 0,
        baselineActiveIds: currentIds,
      });
    } catch (error) {
      throw new BindingSaveError(
        `${summary ? `${summary}. ` : ""}Authoritative reload failed: ${error.message} ${successfulWrites ? "Check saved changes before another Save." : "Retry Save to read the current state."}`,
        {
          outcomes,
          requiresReconciliation: successfulWrites > 0,
          ...priorConfirmation,
          pendingCommentIds: accepted.map((draft) => draft.id),
        }
      );
    }
    const { commentHistory, ...bindingState } = record;
    const confirmedCommentIds = [
      ...alreadyConfirmed,
      ...confirmedBindingCommentIds(accepted, commentHistory ?? []),
    ];
    const pendingCommentIds = accepted
      .map((draft) => draft.id)
      .filter((draftId) => !confirmedCommentIds.includes(draftId));
    if (pendingCommentIds.length) {
      throw new BindingSaveError(
        `${summary}. Could not verify every comment in saved history. Check saved changes before another Save.`,
        {
          record: bindingState,
          commentHistory,
          outcomes,
          confirmedCommentIds,
          pendingCommentIds,
          requiresReconciliation: true,
        }
      );
    }
    const actual = Object.keys(record.relations).sort();
    const matches = JSON.stringify(actual) === JSON.stringify([...desired].sort());
    if (outcomes.some((item) => !item.ok) || !matches) {
      throw new BindingSaveError(
        `${summary}. Bindings reloaded.${matches ? " Requested bindings are now present." : " Requested changes remain in the draft; review and retry."}`,
        { record: bindingState, commentHistory, outcomes, confirmedCommentIds }
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
          ...(supportsPackageOperations
            ? {
                assignmentStatus: Object.keys(PACKAGE_STATUS_LABELS).find(
                  (key) => PACKAGE_STATUS_LABELS[key] === status
                ),
              }
            : { hasPipeline: status ? status === "Assigned" : undefined }),
          signal,
        });
        if (
          supportsPackageOperations &&
          status &&
          result.items.some((item) => !item.assignmentStatus || item.status !== status)
        ) {
          throw new Error("The API did not return the requested Package assignment status.");
        }
        return {
          ...result,
          items: result.items.map((item) => ({
            ...item,
            type: item.category,
            // A server-side filter is not evidence of assignment when the response
            // omits the summary contract. Keep unknown state visible as unknown.
            status: item.status ?? null,
            pipelineIds: item.pipelineIds ?? null,
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
    workspaces: {
      async list({ pipelineId, signal } = {}) {
        if (typeof pipelineId !== "string" || !pipelineId.trim())
          throw new Error("Workstream ID is required for Workspace listing.");
        const items = await collectPages(
          ({ page, pageSize, signal: requestSignal }) =>
            catalogue.workspaces({ pipelineId, page, pageSize, signal: requestSignal }),
          { signal }
        );
        if (items.some((item) => item.pipelineId !== pipelineId))
          throw new Error("Workspace catalogue returned a different Workstream scope.");
        return { items, total: items.length };
      },
    },
    assignments,
  };
}
