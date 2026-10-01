function textElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

export function createWorkStreamRow(workStream, session) {
  const element = document.createElement("article");
  element.className = "dc-work-stream-row";

  const primary = document.createElement("div");
  primary.className = "dc-work-stream-row__primary";

  const label = document.createElement("label");
  label.className = "dc-work-stream-row__selection";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  label.append(checkbox, textElement("strong", workStream.name));

  const actions = document.createElement("div");
  actions.className = "dc-work-stream-row__actions";

  const noGeometry = textElement("span", "No map geometry");
  noGeometry.className = "dc-assignment-muted";
  noGeometry.hidden = workStream.layerIds.length > 0;

  const historyToggle = textElement("button", "Saved history");
  historyToggle.type = "button";
  historyToggle.className = "dc-work-stream-row__history-toggle";
  historyToggle.hidden = true;
  historyToggle.setAttribute("aria-expanded", "false");

  const add = textElement("button", "Add comment");
  add.type = "button";

  actions.append(noGeometry, historyToggle, add);
  primary.append(label, actions);

  const historyBody = document.createElement("div");
  historyBody.className = "dc-work-stream-history";
  historyBody.hidden = true;

  const drafts = document.createElement("div");
  drafts.className = "dc-work-stream-drafts";

  const draftWarning = textElement(
    "p",
    "Assign this Work stream again or remove its unsaved draft comments before saving."
  );
  draftWarning.className = "dc-assignment-validation";
  draftWarning.setAttribute("role", "alert");
  draftWarning.hidden = true;

  element.append(primary, historyBody, drafts, draftWarning);

  checkbox.addEventListener("change", () => session.setAssigned(workStream.id, checkbox.checked));
  add.addEventListener("click", () => session.addComment(workStream.id));
  historyToggle.addEventListener("click", () => {
    const expanded = historyToggle.getAttribute("aria-expanded") === "true";
    historyToggle.setAttribute("aria-expanded", String(!expanded));
    historyBody.hidden = expanded;
  });

  let historyKey = "";
  let historyPage = 0;
  let savedComments = [];
  const commentRefs = new Map();

  function renderHistory() {
    historyBody.replaceChildren();
    const end = savedComments.length - historyPage * 20;

    for (const comment of savedComments.slice(Math.max(0, end - 20), end).reverse()) {
      const item = document.createElement("div");
      item.className = "dc-work-stream-history__item";
      const meta = textElement("small", `${comment.author} · ${comment.createdAt}`);
      const text = textElement("p", comment.text);
      text.className = "dc-assignment-text";
      item.append(meta, text);
      historyBody.append(item);
    }

    if (savedComments.length > 20) {
      const navigation = document.createElement("div");
      navigation.className = "dc-assignment-toolbar";
      const older = textElement("button", "Older comments");
      older.type = "button";
      older.disabled = end <= 20;
      const newer = textElement("button", "Newer comments");
      newer.type = "button";
      newer.disabled = historyPage === 0;
      older.onclick = () => {
        historyPage++;
        renderHistory();
      };
      newer.onclick = () => {
        historyPage--;
        renderHistory();
      };
      navigation.append(newer, older);
      historyBody.append(navigation);
    }
  }

  return {
    element,
    update(state) {
      const active = state.draft.activeIds.includes(workStream.id);
      checkbox.checked = active;
      checkbox.disabled = state.saving;
      add.disabled = state.saving || !active;
      add.title = active
        ? "Add a draft comment"
        : "Assign this Work stream before adding a comment";

      const comments = state.record.relations[workStream.id]?.comments ?? [];
      const key = JSON.stringify(comments);
      if (historyKey !== key) {
        historyKey = key;
        savedComments = comments;
        historyPage = 0;
        historyToggle.textContent = `Saved history (${comments.length})`;
        historyToggle.hidden = comments.length === 0;
        if (!comments.length) {
          historyToggle.setAttribute("aria-expanded", "false");
          historyBody.hidden = true;
        }
        renderHistory();
      }

      const pending = state.draft.comments.filter(
        (comment) => comment.workStreamId === workStream.id
      );
      draftWarning.hidden = active || !pending.length;

      for (const [id, ref] of commentRefs) {
        if (!pending.some((comment) => comment.id === id)) {
          const restoreFocus = ref.container.contains(document.activeElement);
          ref.container.remove();
          commentRefs.delete(id);
          if (restoreFocus) add.focus({ preventScroll: true });
        }
      }

      for (const comment of pending) {
        let ref = commentRefs.get(comment.id);
        if (!ref) {
          const container = document.createElement("div");
          container.className = "dc-comment-draft";
          const input = document.createElement("textarea");
          input.rows = 2;
          input.setAttribute("aria-label", `Draft comment for ${workStream.name}`);
          const remove = textElement("button", "Remove draft");
          remove.type = "button";
          input.addEventListener("input", () => session.editComment(comment.id, input.value));
          remove.addEventListener("click", () => session.removeComment(comment.id));
          container.append(input, remove);
          drafts.append(container);
          ref = { container, input, remove };
          commentRefs.set(comment.id, ref);
        }

        if (ref.input.value !== comment.text) ref.input.value = comment.text;
        ref.input.disabled = state.saving;
        ref.remove.disabled = state.saving;
      }
    },
  };
}
