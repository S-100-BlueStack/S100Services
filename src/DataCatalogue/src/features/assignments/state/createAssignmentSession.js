import {
  assignmentDraftError,
  directDecisionBlock,
  createDraft,
  isDirty,
  rebaseDraftBindings,
} from "../domain/assignmentDraft.js";
import { hasBindingCommentText, trimBindingComment } from "../../../shared/api/bindingComments.js";
import { confirmedBindingCommentIds } from "../domain/confirmedBindingComments.js";

export function createAssignmentSession({ services }) {
  const listeners = new Set();
  let generation = 0;
  let alive = true;
  let pendingSave = null;
  let pendingSelection = null;
  let commentRequest = null;
  let savedPackageId = null;
  const supportsComments = typeof services.assignments?.loadComments === "function";
  const supportsPackageOperations = typeof services.assignments?.packageComments === "function";
  let pendingDecision = null;
  let packageCommentRevision = 0;
  let commentHistory = null;
  let state = {
    feature: null,
    record: null,
    draft: null,
    loading: false,
    saving: false,
    reconciliationRequired: false,
    error: "",
    selectionError: "",
    validationError: "",
    dirty: false,
  };

  function snapshot() {
    // Large retained histories are immutable and shared across draft keystrokes.
    return {
      ...structuredClone(state),
      commentHistory,
      packageCommentRevision,
      pendingDecision: pendingDecision && { ...pendingDecision },
      saveConfirmed: savedPackageId !== null && savedPackageId === state.feature?.id,
    };
  }

  function emit() {
    state.dirty = isDirty(state.record, state.draft);
    if (state.dirty) savedPackageId = null;
    state.validationError = assignmentDraftError(state.draft, {
      allowComments: services.source !== "live" || supportsComments,
      validateCommentText: supportsComments,
    });
    for (const listener of listeners) listener(snapshot());
  }

  function cancelCommentRead() {
    commentRequest?.abort();
    commentRequest = null;
  }

  function publishCommentHistory(items) {
    cancelCommentRead();
    const byPipeline = new Map();
    for (const item of items) {
      if (!byPipeline.has(item.pipelineId)) byPipeline.set(item.pipelineId, []);
      byPipeline.get(item.pipelineId).push(Object.freeze({ ...item }));
    }
    for (const group of byPipeline.values()) Object.freeze(group);
    commentHistory = Object.freeze({
      byPipeline: Object.freeze(Object.fromEntries(byPipeline)),
      loading: false,
      error: "",
    });
  }

  async function refreshComments() {
    if (!alive || !supportsComments || !state.feature || state.loading || commentRequest) return;
    const current = generation;
    const id = state.feature.id;
    const request = new AbortController();
    commentRequest = request;
    commentHistory = Object.freeze({ ...commentHistory, loading: true, error: "" });
    emit();
    try {
      const items = await services.assignments.loadComments(id, { signal: request.signal });
      if (alive && current === generation && commentRequest === request) {
        publishCommentHistory(items);
        emit();
      }
    } catch (error) {
      if (alive && current === generation && commentRequest === request) {
        commentRequest = null;
        commentHistory = Object.freeze({ ...commentHistory, loading: false, error: error.message });
        emit();
      }
    }
  }

  function updateSavedState({
    record,
    commentHistory: comments,
    confirmedCommentIds = [],
    pendingCommentIds = [],
    confirmedPackageIds = [],
    pendingPackageIds = [],
  }) {
    if (record) {
      if (pendingDecision) {
        // A direct decision owns a clean draft. Concurrent bindings become saved context, not removals.
        state.draft.activeIds = createDraft(record).activeIds;
      } else if (state.draft.comments.length || state.draft.decision) {
        state.draft.activeIds = rebaseDraftBindings(
          createDraft(record).activeIds,
          state.draft.activeIds,
          createDraft(state.record).activeIds
        );
      }
      state.record = record;
    }
    if (comments) publishCommentHistory(comments);
    if (pendingDecision && confirmedPackageIds.includes(pendingDecision.id)) {
      if (pendingDecision.kind === "discardReason") packageCommentRevision++;
      pendingDecision = null;
    }
    const decision = state.draft.decision;
    if (decision && confirmedPackageIds.includes(decision.id)) {
      delete state.draft.decision;
    } else if (decision && pendingPackageIds.includes(decision.id)) {
      decision.awaitingConfirmation = true;
    }
    state.draft.comments = state.draft.comments
      .filter((comment) => !confirmedCommentIds.includes(comment.id))
      .map((comment) =>
        pendingCommentIds.includes(comment.id)
          ? { ...comment, awaitingConfirmation: true }
          : comment
      );
  }

  function editable() {
    return alive && state.draft && !state.loading && !state.saving;
  }

  function select(id) {
    if (!alive || state.saving || state.dirty || state.reconciliationRequired || pendingDecision)
      return Promise.resolve(false);
    if (pendingSelection?.id === id) return pendingSelection.promise;

    const current = ++generation;
    cancelCommentRead();
    if (savedPackageId !== id) savedPackageId = null;
    // Keep the last committed Package visible until both its replacement and bindings are ready.
    // Clearing the selection here would temporarily publish an incorrect empty map and draft.
    state.loading = true;
    state.error = "";
    state.selectionError = "";
    emit();

    const promise = Promise.all([
      Promise.resolve().then(() => services.features.get(id)),
      Promise.resolve().then(() => services.assignments.load(id)),
    ])
      .then(([feature, record]) => {
        if (!alive || current !== generation) return false;
        if (supportsPackageOperations) {
          const bound = Object.keys(record.relations);
          if (
            feature.assignmentStatus &&
            (feature.pipelineIds.length !== bound.length ||
              !bound.every((pipelineId) => feature.pipelineIds.includes(pipelineId)))
          ) {
            throw new Error(
              "Package status or Workstream bindings changed during selection. Reload the Package."
            );
          }
          record.assignmentStatus = feature.assignmentStatus ?? null;
        }
        state = {
          feature,
          record,
          draft: createDraft(record),
          loading: false,
          saving: false,
          reconciliationRequired: false,
          error: "",
          selectionError: "",
          validationError: "",
          dirty: false,
        };
        commentHistory = null;
        if (supportsComments) void refreshComments();
        else emit();
        return true;
      })
      .catch((error) => {
        if (alive && current === generation) {
          // Failed selection is not a request to discard the previous committed context.
          state.loading = false;
          state.error = error.message;
          state.selectionError = error.message;
          if (commentHistory?.loading) void refreshComments();
          else emit();
        }
        return false;
      })
      .finally(() => {
        if (pendingSelection?.promise === promise) pendingSelection = null;
      });

    pendingSelection = { id, promise };
    return promise;
  }

  function save() {
    if (pendingDecision) return Promise.resolve(false);
    if (pendingSave) return pendingSave;
    if (!editable() || state.reconciliationRequired) return Promise.resolve(false);
    if (!state.dirty) return Promise.resolve(!state.error);
    if (state.validationError) return Promise.resolve(false);

    const current = generation;
    const id = state.feature.id;
    const payload = structuredClone(state.draft);
    const baselineActiveIds = createDraft(state.record).activeIds;
    let confirmed = false;
    state.saving = true;
    state.error = "";
    state.selectionError = "";
    emit();

    pendingSave = Promise.resolve()
      .then(() => services.assignments.save(id, payload, { baselineActiveIds }))
      .then((record) => {
        if (!alive || generation !== current) return false;
        const { commentHistory: comments, confirmedPackageIds, ...bindingState } = record;
        updateSavedState({ record: bindingState, commentHistory: comments, confirmedPackageIds });
        state.draft = createDraft(bindingState);
        state.reconciliationRequired = false;
        if (!comments && supportsComments) void refreshComments();
        // The live Save service resolves only after authoritative readback confirms the draft.
        confirmed = services.source === "live";
        return true;
      })
      .catch((error) => {
        if (alive && generation === current) {
          updateSavedState(error);
          state.reconciliationRequired = Boolean(error.requiresReconciliation);
          state.error = error.message;
          if (error.record && !error.commentHistory && supportsComments) void refreshComments();
        }
        return false;
      })
      .finally(() => {
        pendingSave = null;
        if (alive && generation === current) {
          state.saving = false;
          if (confirmed) savedPackageId = id;
          emit();
        }
      });

    return pendingSave;
  }

  function changePackageDecision(kind, text = "") {
    if (
      pendingSave ||
      !alive ||
      !services.assignments.changeDecision ||
      directDecisionBlock(state) ||
      kind !== (state.record.assignmentStatus === "discarded" ? "reopen" : "discardReason") ||
      (kind === "discardReason" && !hasBindingCommentText(text)) ||
      (pendingDecision && pendingDecision.kind !== kind)
    )
      return Promise.resolve(false);

    const operation = pendingDecision ?? {
      id: crypto.randomUUID(),
      kind,
      text: kind === "discardReason" ? trimBindingComment(text) : "",
    };
    pendingDecision = operation;
    const current = generation;
    const packageId = state.feature.id;
    savedPackageId = null;
    state.saving = true;
    state.error = "";

    pendingSave = Promise.resolve()
      .then(() => services.assignments.changeDecision(packageId, operation))
      .then((result) => {
        if (!alive || generation !== current) return false;
        updateSavedState(result);
        return true;
      })
      .catch((error) => {
        if (!alive || generation !== current) return false;
        updateSavedState(error);
        state.reconciliationRequired = Boolean(error.requiresReconciliation);
        if (state.reconciliationRequired) operation.awaitingConfirmation = true;
        else pendingDecision = null;
        state.error = error.message;
        return false;
      })
      .finally(() => {
        pendingSave = null;
        if (alive && generation === current) {
          state.saving = false;
          emit();
        }
      });
    emit();
    return pendingSave;
  }

  function reconcile() {
    if (pendingSave) return pendingSave;
    if (!editable() || (!state.reconciliationRequired && !pendingDecision) || !state.feature)
      return Promise.resolve(false);

    const current = generation;
    const id = state.feature.id;
    const awaiting = state.draft.comments.filter((comment) => comment.awaitingConfirmation);
    const awaitingPackageOperations = [pendingDecision, state.draft.decision].filter(
      (operation) => operation?.awaitingConfirmation
    );
    const baselineActiveIds = createDraft(state.record).activeIds;
    state.saving = true;
    state.error = "";
    emit();

    pendingSave = Promise.resolve()
      .then(() =>
        (services.assignments.reconcile ?? services.assignments.load)(id, {
          includeComments: awaiting.length > 0,
          awaitingComments: awaiting,
          ...(awaitingPackageOperations.length ? { awaitingPackageOperations } : {}),
          baselineActiveIds,
        })
      )
      .then(({ commentHistory: comments, confirmedPackageIds, ...record }) => {
        if (!alive || generation !== current) return false;
        updateSavedState({
          record,
          commentHistory: comments,
          confirmedCommentIds: confirmedBindingCommentIds(awaiting, comments ?? []),
          confirmedPackageIds,
        });
        state.reconciliationRequired = false;
        state.error = awaitingPackageOperations.length
          ? pendingDecision
            ? "No matching decision found. Retry the same decision or check again."
            : "Saved Package status and decisions reloaded."
          : comments
            ? "Saved bindings and comments reloaded. Review any remaining drafts before another Save."
            : "Saved bindings reloaded. Review your draft before another Save. A timed-out request may still complete on the server.";
        return true;
      })
      .catch((error) => {
        if (alive && generation === current) {
          state.error = `Could not verify saved changes: ${error.message} Check again before saving.`;
        }
        return false;
      })
      .finally(() => {
        pendingSave = null;
        if (alive && generation === current) {
          state.saving = false;
          emit();
        }
      });
    return pendingSave;
  }

  return {
    snapshot,
    select,
    save,
    reconcile,
    changePackageDecision,
    refreshComments,
    abandonUncertainDraft() {
      if (!alive || state.saving || (!state.reconciliationRequired && !pendingDecision))
        return false;
      // This discards only the browser draft. A timed-out server mutation may still complete.
      generation++;
      pendingDecision = null;
      cancelCommentRead();
      commentHistory = null;
      savedPackageId = null;
      state = {
        feature: null,
        record: null,
        draft: null,
        loading: false,
        saving: false,
        reconciliationRequired: false,
        error: "",
        selectionError: "",
        validationError: "",
        dirty: false,
      };
      emit();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    setAssigned(id, active) {
      if (!editable() || pendingDecision) return;
      if (active && state.record.assignmentStatus === "discarded" && !state.draft.decision) {
        state.draft.decision = { id: crypto.randomUUID(), kind: "reopen", text: "" };
      }
      state.draft.activeIds = state.draft.activeIds.filter((value) => value !== id);
      if (active) state.draft.activeIds.push(id);
      if (
        !state.draft.activeIds.length &&
        state.draft.decision?.kind === "reopen" &&
        !state.draft.decision.awaitingConfirmation
      )
        delete state.draft.decision;
      emit();
    },
    addComment(workStreamId) {
      if (!editable() || pendingDecision || !state.draft.activeIds.includes(workStreamId))
        return false;
      state.draft.comments.push({
        id: crypto.randomUUID(),
        workStreamId,
        text: "",
      });
      emit();
      return true;
    },
    editComment(id, text) {
      if (!editable()) return;
      const comment = state.draft.comments.find((item) => item.id === id);
      if (comment && !comment.awaitingConfirmation) {
        comment.text = text;
        emit();
      }
    },
    removeComment(id) {
      if (editable()) {
        state.draft.comments = state.draft.comments.filter((item) => item.id !== id);
        emit();
      }
    },
    discard() {
      if (editable() && !state.reconciliationRequired) {
        state.draft = createDraft(state.record);
        state.error = "";
        emit();
      }
    },
    clear() {
      if (!alive || state.saving || state.dirty || state.reconciliationRequired || pendingDecision)
        return false;
      generation++;
      pendingSelection = null;
      cancelCommentRead();
      commentHistory = null;
      savedPackageId = null;
      state = {
        feature: null,
        record: null,
        draft: null,
        loading: false,
        saving: false,
        reconciliationRequired: false,
        error: "",
        selectionError: "",
        validationError: "",
        dirty: false,
      };
      emit();
      return true;
    },
    clearSaveConfirmation() {
      if (savedPackageId === null) return;
      savedPackageId = null;
      emit();
    },
    destroy() {
      alive = false;
      generation++;
      pendingSelection = null;
      cancelCommentRead();
      savedPackageId = null;
      listeners.clear();
    },
  };
}
