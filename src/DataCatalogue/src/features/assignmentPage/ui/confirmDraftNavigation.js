export function createDraftNavigation({ session, host, onSaved }) {
  let pending = false;
  const dialog = document.createElement("dialog");
  dialog.className = "dc-assignment-dialog";
  dialog.setAttribute("aria-labelledby", "dc-draft-title");
  dialog.innerHTML = `<h2 id="dc-draft-title">Unsaved changes</h2><p>Save your changes, discard them, or stay on this Feature.</p><div class="dc-assignment-toolbar"><button type="button" data-choice="save">Save and continue</button><button type="button" data-choice="discard">Discard changes</button><button type="button" data-choice="cancel" autofocus>Cancel</button></div>`;
  host.append(dialog);
  let resolveChoice = null;
  dialog.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-choice]")?.dataset.choice;
    if (choice) {
      dialog.returnValue = choice;
      dialog.close();
    }
  });
  dialog.addEventListener("cancel", () => {
    dialog.returnValue = "cancel";
  });
  dialog.addEventListener("close", () => {
    resolveChoice?.(dialog.returnValue || "cancel");
    resolveChoice = null;
  });
  return {
    async allow() {
      if (pending || session.snapshot().saving) return false;
      if (!session.snapshot().dirty) return true;
      pending = true;
      try {
        const choice = await new Promise((resolve) => {
          resolveChoice = resolve;
          dialog.returnValue = "cancel";
          dialog.showModal();
        });
        if (choice === "discard") {
          session.discard();
          return true;
        }
        if (choice === "save") {
          const saved = await session.save();
          if (saved) onSaved();
          return saved;
        }
        return false;
      } finally {
        pending = false;
      }
    },
    destroy() {
      resolveChoice?.("cancel");
      resolveChoice = null;
      dialog.remove();
    },
  };
}
