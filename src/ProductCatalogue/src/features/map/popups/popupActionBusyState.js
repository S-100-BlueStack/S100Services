export function setPopupActionLoading(action, { text = "Working...", title = text } = {}) {
  if (!action) {
    return () => {};
  }

  const previousState = captureActionState(action);

  action.dataset.busy = "true";
  action.loading = true;
  action.disabled = true;

  action.setAttribute("loading", "");
  action.setAttribute("disabled", "");
  action.setAttribute("aria-busy", "true");
  action.setAttribute("aria-disabled", "true");

  setActionText(action, text);
  setActionTitle(action, title);

  return () => {
    restoreActionState(action, previousState);
  };
}

function captureActionState(action) {
  return {
    busy: action.dataset.busy,
    disabled: action.disabled,
    loading: action.loading,
    text: action.text,
    title: action.title,
    textAttribute: action.getAttribute("text"),
    titleAttribute: action.getAttribute("title"),
    ariaBusyAttribute: action.getAttribute("aria-busy"),
    ariaDisabledAttribute: action.getAttribute("aria-disabled"),
    hadDisabledAttribute: action.hasAttribute("disabled"),
    hadLoadingAttribute: action.hasAttribute("loading"),
  };
}

function restoreActionState(action, previousState) {
  restoreDatasetValue(action.dataset, "busy", previousState.busy);

  action.disabled = previousState.disabled;
  action.loading = previousState.loading;
  action.text = previousState.text;
  action.title = previousState.title;

  restoreAttribute(action, "text", previousState.textAttribute);
  restoreAttribute(action, "title", previousState.titleAttribute);
  restoreAttribute(action, "aria-busy", previousState.ariaBusyAttribute);
  restoreAttribute(action, "aria-disabled", previousState.ariaDisabledAttribute);

  restoreBooleanAttribute(action, "disabled", previousState.hadDisabledAttribute);
  restoreBooleanAttribute(action, "loading", previousState.hadLoadingAttribute);
}

function setActionText(action, text) {
  action.text = text;
  action.setAttribute("text", text);
}

function setActionTitle(action, title) {
  action.title = title;
  action.setAttribute("title", title);
}

function restoreAttribute(element, name, value) {
  if (value == null) {
    element.removeAttribute(name);
    return;
  }

  element.setAttribute(name, value);
}

function restoreBooleanAttribute(element, name, shouldExist) {
  if (shouldExist) {
    element.setAttribute(name, "");
    return;
  }

  element.removeAttribute(name);
}

function restoreDatasetValue(dataset, key, value) {
  if (value === undefined) {
    delete dataset[key];
    return;
  }

  dataset[key] = value;
}
