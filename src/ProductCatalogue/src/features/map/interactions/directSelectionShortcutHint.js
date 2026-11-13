export const DIRECT_SELECTION_SHORTCUT_TEXT =
  "Ctrl-click or Ctrl+Enter to open highlighted Product";

export function getDirectSelectionShortcutText(platform = "") {
  const modifier = /mac/i.test(String(platform)) ? "Cmd" : "Ctrl";
  return `${modifier}-click or ${modifier}+Enter to open highlighted Product`;
}

export function bindDirectSelectionShortcutHint(
  view,
  { hoverManager, documentRef = globalThis.document, platform } = {}
) {
  if (
    !view?.ui?.add ||
    !view?.ui?.remove ||
    !documentRef?.createElement ||
    !hoverManager?.subscribeHighlightedGraphicIdentity
  ) {
    return () => {};
  }

  const detectedPlatform =
    platform ?? globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform;
  const text = getDirectSelectionShortcutText(detectedPlatform);
  const hint = documentRef.createElement("div");
  hint.className = "map-direct-selection-hint";
  hint.textContent = text;
  hint.title = text;
  hint.hidden = true;
  hint.setAttribute("role", "note");
  hint.setAttribute("aria-label", text);

  view.ui.add(hint, "bottom-left");

  const unsubscribe = hoverManager.subscribeHighlightedGraphicIdentity((identity) => {
    hint.hidden = !identity;
  });

  return () => {
    unsubscribe?.();
    view.ui.remove(hint);
  };
}
