import { fetchIcEncReportBytes } from "../api/icEncReportApi.js";
import { getIcEncReportArtifact } from "../domain/icEncReportArtifact.js";

const LOAD_TIMEOUT_MS = 20000;
let activeViewer = null;

export function openIcEncReportViewer(
  artifact,
  trigger,
  {
    loadBytes = fetchIcEncReportBytes,
    loadDocument = () => import("../domain/icEncReportDocument.js"),
  } = {}
) {
  const verified = getIcEncReportArtifact(artifact, artifact?.datasetName, artifact?.url);
  if (!verified) return;
  const document = trigger.ownerDocument;
  const view = document.defaultView;
  if (activeViewer?.url === verified.url) return;
  // Another native modal (including SevenCs) keeps priority.
  if (document.querySelector("dialog[open]:not(.pc-icenc-report-dialog)")) return;
  activeViewer?.close(false);

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  const controller = new AbortController();
  const { signal } = controller;
  const location = view.location.href;
  const dialog = element("dialog", "pc-vld-dialog pc-icenc-report-dialog");
  dialog.setAttribute("aria-labelledby", "pc-icenc-report-title");
  const header = element("header", "pc-vld-header");
  const titleWrap = element("div", "pc-vld-title-wrap");
  const title = element("h2", "", "IC-ENC report");
  title.id = "pc-icenc-report-title";
  titleWrap.append(
    title,
    element("div", "pc-vld-file-name", verified.fileName),
    element("div", "pc-vld-meta", verified.datasetName)
  );
  const actions = element("div", "pc-vld-actions");
  const download = element("a", "pc-vld-button", "Download");
  download.href = verified.url;
  download.download = verified.fileName;
  download.setAttribute("aria-label", `Download original ${verified.fileName}`);
  const closeButton = element("button", "pc-vld-button", "Close");
  closeButton.type = "button";
  closeButton.autofocus = true;
  closeButton.addEventListener("click", () => close());
  actions.append(download, closeButton);
  header.append(titleWrap, actions);
  const body = element("div", "pc-vld-body pc-icenc-report-body pc-scrollbar");
  body.setAttribute("role", "region");
  body.setAttribute("aria-label", "Report content");
  body.tabIndex = 0;
  const status = element("p", "pc-vld-state", "Loading report…");
  status.setAttribute("role", "status");
  body.appendChild(status);
  dialog.append(header, body);

  let closed = false;
  let timeout;
  let backdropPressed = false;
  const session = { url: verified.url, close };
  const navigation = view.navigation;
  let anchor = trigger;
  const visible = (node) => node.isConnected && node.getClientRects().length && !node.disabled;
  const observer = view.MutationObserver
    ? new view.MutationObserver((records) => {
        if (
          !anchor.isConnected ||
          records.some((record) => record.type === "attributes" && record.target.contains(anchor))
        ) {
          checkContext();
        }
      })
    : null;

  function findReplacementAction() {
    const matches = [...document.querySelectorAll("[data-ic-enc-report-key]")].filter(
      (node) => node.dataset.icEncReportKey === verified.url && visible(node)
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function checkContext() {
    onRouteChange();
    if (closed || visible(anchor)) return;
    // Underlying panels may refresh the selected row in place. Continue only
    // when a unique visible action still identifies this exact download.
    const replacement = findReplacementAction();
    if (replacement) anchor = replacement;
    else close(false);
  }
  function onRouteChange() {
    if (view.location.href !== location) close(false);
  }
  function onPageHide() {
    close(false);
  }
  function onEscape(event) {
    if (event.key !== "Escape" || !dialog.open || !dialog.contains(document.activeElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }
  function close(restoreFocus = true) {
    if (closed) return;
    closed = true;
    view.clearTimeout(timeout);
    controller.abort();
    observer?.disconnect();
    view.removeEventListener("keydown", onEscape, true);
    view.removeEventListener("pagehide", onPageHide);
    view.removeEventListener("popstate", onRouteChange);
    view.removeEventListener("hashchange", onRouteChange);
    navigation?.removeEventListener("currententrychange", onRouteChange);
    if (dialog.open) dialog.close();
    dialog.remove();
    if (activeViewer === session) activeViewer = null;
    if (restoreFocus) restoreTriggerFocus();
  }

  function restoreTriggerFocus() {
    const target = visible(anchor) ? anchor : findReplacementAction();
    target?.focus({ preventScroll: true });
  }

  function onBackdrop(event) {
    if (event.target !== dialog) return false;
    const box = dialog.getBoundingClientRect();
    return (
      event.clientX < box.left ||
      event.clientX >= box.right ||
      event.clientY < box.top ||
      event.clientY >= box.bottom
    );
  }

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => close());
  dialog.addEventListener("pointerdown", (event) => {
    backdropPressed = event.isPrimary && event.button === 0 && onBackdrop(event);
  });
  dialog.addEventListener("pointercancel", () => {
    backdropPressed = false;
  });
  dialog.addEventListener("click", (event) => {
    event.stopPropagation();
    const dismiss = backdropPressed && event.detail > 0 && onBackdrop(event);
    backdropPressed = false;
    if (dismiss) close();
  });

  activeViewer = session;
  document.body.appendChild(dialog);
  try {
    dialog.showModal();
  } catch {
    close();
    return;
  }
  view.addEventListener("keydown", onEscape, true);
  view.addEventListener("pagehide", onPageHide);
  view.addEventListener("popstate", onRouteChange);
  view.addEventListener("hashchange", onRouteChange);
  navigation?.addEventListener("currententrychange", onRouteChange);
  observer?.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "open"],
  });
  timeout = view.setTimeout(() => {
    controller.abort();
    showFallback();
  }, LOAD_TIMEOUT_MS);
  void load();

  function showFallback() {
    status.textContent = "Preview unavailable. Download the original report to read it.";
  }

  async function load() {
    try {
      const { readIcEncReportDocument } = await loadDocument();
      checkContext();
      signal.throwIfAborted();
      const bytes = await loadBytes(verified, { signal });
      checkContext();
      signal.throwIfAborted();
      const report = await readIcEncReportDocument(bytes, { signal });
      checkContext();
      signal.throwIfAborted();
      renderReport(report);
    } catch {
      if (!signal.aborted) showFallback();
    } finally {
      view.clearTimeout(timeout);
    }
  }

  function renderReport(report) {
    const contents = document.createDocumentFragment();
    if (report.partial) {
      contents.appendChild(
        element("p", "pc-vld-warning", "Some content is only available in the original report.")
      );
    }
    if (report.metadata.length) {
      const metadata = element("dl", "pc-icenc-report-metadata");
      for (const { label, value } of report.metadata) {
        metadata.append(element("dt", "", label), element("dd", "", value));
      }
      contents.appendChild(metadata);
    }
    appendBlocks(contents, report.blocks);
    body.replaceChildren(contents);
  }

  function appendBlocks(container, blocks) {
    for (const block of blocks) {
      if (block.type === "table") {
        const table = element("table", "pc-icenc-report-table");
        const rows = element("tbody");
        for (const cells of block.rows) {
          const row = element("tr");
          for (const content of cells) {
            const cell = element("td");
            appendBlocks(cell, content);
            row.appendChild(cell);
          }
          rows.appendChild(row);
        }
        table.appendChild(rows);
        container.appendChild(table);
      } else if (block.type === "heading") {
        container.appendChild(element("h3", "pc-icenc-report-heading", block.text));
      } else if (block.text.trim()) {
        container.appendChild(element("p", "pc-icenc-report-text", block.text));
      }
    }
  }
}
