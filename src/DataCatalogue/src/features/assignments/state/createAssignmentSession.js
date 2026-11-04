import { assignmentDraftError, createDraft, isDirty } from "../domain/assignmentDraft.js";

export function createAssignmentSession({ services }) {
  const listeners = new Set();
  let generation = 0;
  let alive = true;
  let pendingSave = null;
  let pendingSelection = null;
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
    return structuredClone(state);
  }

  function emit() {
    state.dirty = isDirty(state.record, state.draft);
    state.validationError = assignmentDraftError(state.draft);
    for (const listener of listeners) listener(snapshot());
  }

  function editable() {
    return alive && state.draft && !state.loading && !state.saving;
  }

  function select(id) {
    if (!alive || state.saving || state.dirty || state.reconciliationRequired)
      return Promise.resolve(false);
    if (pendingSelection?.id === id) return pendingSelection.promise;

    const current = ++generation;
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
        emit();
        return true;
      })
      .catch((error) => {
        if (alive && current === generation) {
          // Failed selection is not a request to discard the previous committed context.
          state.loading = false;
          state.error = error.message;
          state.selectionError = error.message;
          emit();
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
    if (pendingSave) return pendingSave;
    if (!editable() || state.reconciliationRequired) return Promise.resolve(false);
    if (!state.dirty) return Promise.resolve(!state.error);
    if (state.validationError) return Promise.resolve(false);

    const current = generation;
    const id = state.feature.id;
    const payload = structuredClone(state.draft);
    state.saving = true;
    state.error = "";
    state.selectionError = "";
    emit();

    pendingSave = Promise.resolve()
      .then(() => services.assignments.save(id, payload))
      .then((record) => {
        if (!alive || generation !== current) return false;
        state.record = record;
        state.draft = createDraft(record);
        state.reconciliationRequired = false;
        return true;
      })
      .catch((error) => {
        if (alive && generation === current) {
          if (error.record) state.record = error.record;
          state.reconciliationRequired = Boolean(error.requiresReconciliation);
          state.error = error.message;
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

  function reconcile() {
    if (pendingSave) return pendingSave;
    if (!editable() || !state.reconciliationRequired || !state.feature)
      return Promise.resolve(false);

    const current = generation;
    const id = state.feature.id;
    state.saving = true;
    state.error = "";
    emit();

    pendingSave = Promise.resolve()
      .then(() => (services.assignments.reconcile ?? services.assignments.load)(id))
      .then((record) => {
        if (!alive || generation !== current) return false;
        // Preserve the intended draft; only the server-owned record may be replaced.
        state.record = record;
        state.reconciliationRequired = false;
        state.error =
          "Saved bindings reloaded. Review your draft before another Save. A timed-out request may still complete on the server.";
        return true;
      })
      .catch((error) => {
        if (alive && generation === current) {
          state.error = `Could not verify saved bindings: ${error.message} Check again before saving.`;
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
    abandonUncertainDraft() {
      if (!alive || state.saving || !state.reconciliationRequired) return false;
      // This discards only the browser draft. A timed-out server mutation may still complete.
      generation++;
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
      if (!editable()) return;
      state.draft.activeIds = state.draft.activeIds.filter((value) => value !== id);
      if (active) state.draft.activeIds.push(id);
      emit();
    },
    addComment(workStreamId) {
      if (!editable() || !state.draft.activeIds.includes(workStreamId)) return false;
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
      if (comment) {
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
      if (!alive || state.saving || state.dirty || state.reconciliationRequired) return false;
      generation++;
      pendingSelection = null;
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
    destroy() {
      alive = false;
      generation++;
      pendingSelection = null;
      listeners.clear();
    },
  };
}
