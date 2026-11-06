import { writeStoredThemeMode } from "../../theme/state/themeStorage.js";

const STORAGE_ROWS = [
  ["rememberBasemap", "Remember basemap"],
  ["rememberMapPosition", "Remember map location and zoom"],
  ["rememberTheme", "Remember theme"],
];

// A small application-owned panel avoids coupling Preferences availability to
// asynchronous Calcite popover initialization. Calcite Action remains the trigger.
export function createPreferencesPanel({
  navbarElement,
  settings,
  themeStore,
  basemapSettings,
  documentRef = document,
}) {
  const button = navbarElement.querySelector("#preferences-button");
  const host = navbarElement.querySelector("#preferences-panel");
  if (!button || !host) throw new Error("Preferences navigation controls are missing.");

  const abort = new AbortController();
  const { signal } = abort;
  const panel = documentRef.createElement("section");
  panel.className = "dc-preferences";
  panel.setAttribute("aria-label", "Preferences settings");
  const header = documentRef.createElement("div");
  header.className = "dc-preferences__header";
  const heading = documentRef.createElement("h2");
  heading.id = "data-catalogue-preferences-title";
  heading.textContent = "Preferences";
  const closeButton = documentRef.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dc-preferences__close";
  closeButton.setAttribute("aria-label", "Close Preferences");
  closeButton.textContent = "×";
  header.append(heading, closeButton);

  const themeLabel = documentRef.createElement("label");
  themeLabel.className = "dc-preferences__row";
  const themeText = documentRef.createElement("span");
  themeText.textContent = "Theme";
  const themeSelect = documentRef.createElement("select");
  themeSelect.setAttribute("aria-label", "Theme");
  for (const [label, value] of [
    ["Light", "light"],
    ["Dark", "dark"],
  ]) {
    const option = documentRef.createElement("option");
    option.value = value;
    option.textContent = label;
    themeSelect.append(option);
  }
  themeLabel.append(themeText, themeSelect);

  const basemapRow = documentRef.createElement("div");
  basemapRow.className = "dc-preferences__row";
  const basemapDescription = documentRef.createElement("span");
  const resetBasemap = documentRef.createElement("button");
  resetBasemap.type = "button";
  resetBasemap.className = "dc-preferences__reset-basemap";
  resetBasemap.textContent = "Use theme default";
  resetBasemap.title = "Automatically select a light or dark basemap to match the theme";
  basemapRow.append(basemapDescription, resetBasemap);

  const storageTitle = documentRef.createElement("h3");
  storageTitle.textContent = "Local preferences";
  panel.append(header, themeLabel, basemapRow, storageTitle);

  const controls = new Map();
  for (const [key, title] of STORAGE_ROWS) {
    const label = documentRef.createElement("label");
    label.className = "dc-preferences__row";
    const input = documentRef.createElement("input");
    input.type = "checkbox";
    input.name = key;
    input.addEventListener(
      "change",
      () => {
        settings.set(key, input.checked);
        if (key === "rememberTheme" && input.checked) {
          writeStoredThemeMode(settings.themeStorage, themeStore.getSnapshot().themeMode);
        }
      },
      { signal }
    );
    label.append(documentRef.createTextNode(title), input);
    controls.set(key, input);
    panel.append(label);
  }
  const help = documentRef.createElement("p");
  help.textContent =
    "Disabling a saved preference clears its stored value. The current session remains unchanged.";
  help.className = "dc-preferences__help";
  panel.append(help);
  host.replaceChildren(panel);

  function setOpen(open, { restoreFocus = false } = {}) {
    host.hidden = !open;
    host.inert = !open;
    button.active = open;
    button.setAttribute("aria-expanded", String(open));
    if (!open && restoreFocus) button.focus?.({ preventScroll: true });
  }

  const unsubscribeSettings = settings.subscribe((snapshot) => {
    for (const [key, input] of controls) input.checked = snapshot[key];
  });
  const unsubscribeTheme = themeStore.subscribe(({ themeMode }) => {
    themeSelect.value = themeMode;
  });
  const unsubscribeBasemap =
    basemapSettings?.subscribe(() => {
      const manual = basemapSettings.isCustom();
      basemapDescription.textContent = manual ? "Basemap: Custom" : "Basemap: Automatic";
      resetBasemap.disabled = !manual;
    }) ?? (() => {});
  themeSelect.addEventListener("change", () => themeStore.setThemeMode(themeSelect.value), {
    signal,
  });
  resetBasemap.addEventListener("click", () => basemapSettings?.resetToThemeDefault(), { signal });
  closeButton.addEventListener("click", () => setOpen(false, { restoreFocus: true }), { signal });
  button.addEventListener("click", () => setOpen(host.hidden), { signal });
  documentRef.addEventListener(
    "pointerdown",
    (event) => {
      if (host.hidden) return;
      const path = event.composedPath?.() ?? [];
      if (
        host.contains(event.target) ||
        button.contains(event.target) ||
        path.includes(host) ||
        path.includes(button)
      )
        return;
      setOpen(false);
    },
    { signal }
  );
  documentRef.addEventListener(
    "keydown",
    (event) => {
      if (host.hidden || event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false, { restoreFocus: true });
    },
    { signal }
  );
  setOpen(false);

  return {
    destroy() {
      abort.abort();
      unsubscribeSettings();
      unsubscribeTheme();
      unsubscribeBasemap();
      setOpen(false);
      host.replaceChildren();
    },
  };
}
