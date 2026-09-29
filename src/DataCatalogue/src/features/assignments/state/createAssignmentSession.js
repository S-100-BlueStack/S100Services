import { assignmentDraftError, createDraft, isDirty } from "../domain/assignmentDraft.js";

export function createAssignmentSession({ services }) {
  const listeners = new Set();
  let generation = 0;
  let alive = true;
  let pendingSave = null;
  let state = {
    feature: null,
    record: null,
    draft: null,
    loading: false,
    saving: false,
    error: "",
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

  async function select(id) {
    if (!alive || state.saving || state.dirty) return false;

    const current = ++generation;
    state = {
      feature: null,
      record: null,
      draft: null,
      loading: true,
      saving: false,
      error: "",
      validationError: "",
      dirty: false,
    };
    emit();

    try {
      const [feature, record] = await Promise.all([
        services.features.get(id),
        services.assignments.load(id),
      ]);
      if (!alive || current !== generation) return false;
      state = { ...state, feature, record, draft: createDraft(record), loading: false };
      emit();
      return true;
    } catch (error) {
      if (alive && current === generation) {
        state.loading = false;
        state.error = error.message;
        emit();
      }
      return false;
    }
  }

  function save() {
    if (pendingSave) return pendingSave;
    if (!editable() || !state.dirty) return Promise.resolve(!state.error);
    if (state.validationError) return Promise.resolve(false);

    const current = generation;
    const id = state.feature.id;
    const payload = structuredClone(state.draft);
    state.saving = true;
    state.error = "";
    emit();

    pendingSave = Promise.resolve()
      .then(() => services.assignments.save(id, payload))
      .then((record) => {
        if (!alive || generation !== current) return false;
        state.record = record;
        state.draft = createDraft(record);
        return true;
      })
      .catch((error) => {
        if (alive && generation === current) state.error = error.message;
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
      if (editable()) {
        state.draft = createDraft(state.record);
        state.error = "";
        emit();
      }
    },
    clear() {
      if (!alive || state.saving || state.dirty) return false;
      generation++;
      state = {
        feature: null,
        record: null,
        draft: null,
        loading: false,
        saving: false,
        error: "",
        validationError: "",
        dirty: false,
      };
      emit();
      return true;
    },
    destroy() {
      alive = false;
      generation++;
      listeners.clear();
    },
  };
}
