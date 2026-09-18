export const DIRECT_SELECTION_SHORTCUT_TEXT =
  "Ctrl/Cmd-click or Ctrl/Cmd+Enter to open highlighted Product";

export function bindDirectSelectionShortcutHint(
  view,
  { hoverManager, documentRef = globalThis.document } = {}
) {
  if (
    !view?.ui?.add ||
    !view?.ui?.remove ||
    !documentRef?.createElement ||
    !hoverManager?.subscribeHighlightedGraphicIdentity
  ) {
    return () => {};
  }

  const hint = documentRef.createElement("div");
  hint.className = "map-direct-selection-hint";
  hint.textContent = DIRECT_SELECTION_SHORTCUT_TEXT;
  hint.title = DIRECT_SELECTION_SHORTCUT_TEXT;
  hint.hidden = true;
  hint.setAttribute("role", "note");
  hint.setAttribute("aria-label", DIRECT_SELECTION_SHORTCUT_TEXT);

  view.ui.add(hint, "bottom-left");

  const unsubscribe = hoverManager.subscribeHighlightedGraphicIdentity((identity) => {
    hint.hidden = !identity;
  });

  return () => {
    unsubscribe?.();
    view.ui.remove(hint);
  };
}
