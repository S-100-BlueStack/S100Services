const FOCUS_SELECTOR = "[data-job-focus]";

export function createJobsFocusRecovery(root, documentRef = document) {
  let keyboardIntent = false;
  let pointerIntent = false;
  let pending = null;
  let fallbackElement = null;

  const onKeyboard = () => {
    keyboardIntent = true;
    pointerIntent = false;
  };
  const onPointer = () => {
    // A pointer action anywhere on the page supersedes a pending keyboard focus return.
    keyboardIntent = false;
    pointerIntent = true;
    pending = null;
    fallbackElement = null;
  };
  root.addEventListener("keydown", onKeyboard);
  root.addEventListener("pointerdown", onPointer);
  documentRef.addEventListener?.("keydown", onKeyboard, true);
  documentRef.addEventListener?.("pointerdown", onPointer, true);

  function capture() {
    const active = documentRef.activeElement;
    if (!active) return null;
    if (active === root || active === fallbackElement || active === documentRef.body) {
      return pending;
    }
    if (!root.contains(active)) {
      pending = null;
      return null;
    }
    const actionElement = active.closest?.(FOCUS_SELECTOR);
    if (!actionElement) {
      pending = null;
      return null;
    }
    if (pointerIntent || (!keyboardIntent && !active.matches?.(":focus-visible"))) return null;
    const scope = actionElement.closest("[data-job-id]");
    pending = {
      jobId: scope?.dataset.jobId ?? null,
      action: actionElement.dataset.jobFocus,
    };
    return pending;
  }

  function restore(token) {
    if (!token || root.isConnected === false) return;
    // The control may have been removed during loading. Keep its logical identity until
    // it returns; never restore after focus has moved to an unrelated external element.
    const controls = [...root.querySelectorAll(FOCUS_SELECTOR)];
    const current = controls.find(
      (item) =>
        !item.disabled &&
        item.dataset.jobFocus === token.action &&
        (item.closest("[data-job-id]")?.dataset.jobId ?? null) === token.jobId
    );
    if (current) {
      current.focus({ preventScroll: true });
      pending = null;
      fallbackElement = null;
      return;
    }

    const jobScope = [...root.querySelectorAll("[data-job-id]")].find(
      (item) => item.dataset.jobId === token.jobId
    );
    const fallback =
      jobScope ??
      controls.find((item) => !item.disabled && item.dataset.jobFocus === "refresh") ??
      controls.find((item) => !item.disabled && item.dataset.jobFocus === "retry") ??
      root;
    fallback.focus({ preventScroll: true });
    fallbackElement = fallback;
    // A removed Job has no future control to restore: keep focus on a stable fallback.
    if (!jobScope && !fallback.classList?.contains("job-list")) pending = null;
  }

  function destroy() {
    root.removeEventListener?.("keydown", onKeyboard);
    root.removeEventListener?.("pointerdown", onPointer);
    documentRef.removeEventListener?.("keydown", onKeyboard, true);
    documentRef.removeEventListener?.("pointerdown", onPointer, true);
    pending = null;
    fallbackElement = null;
  }

  return { capture, restore, destroy };
}
