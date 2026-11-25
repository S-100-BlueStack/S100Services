import { fetchValidationReportBytes } from "../api/validationReportApi.js";
import { getValidationViewerArtifact } from "../domain/validationViewerArtifact.js";
import {
  decodeValidationReport,
  parseSevenCsValidationReport,
  selectValidationChecks,
  VALIDATION_SEVERITIES,
} from "../domain/sevenCsValidationReport.js";

let activeViewer = null;
const countFormat = new Intl.NumberFormat("da-DK");
const OBJECT_PAGE_SIZE = 25;

function element(tag, className = "", content = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

function button(label, onClick, className = "pc-vld-button") {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function count(value) {
  return countFormat.format(value);
}

function formatDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf())) return value || "";
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function labeledText(parent, label, value) {
  if (!value) return;
  parent.append(
    element("h4", "pc-vld-field-label", label),
    element("p", "pc-vld-field-value", value)
  );
}

function restoreTriggerFocus(trigger) {
  // A refresh may replace the original action while the immutable report is open.
  // Restore a matching replacement only when it is unique and actually visible.
  const visible = (node) => node?.isConnected && node.getClientRects().length && !node.disabled;
  if (visible(trigger)) {
    trigger.focus({ preventScroll: true });
    return;
  }
  const key = trigger?.dataset.validationViewerKey;
  if (!key) return;
  const replacements = [...document.querySelectorAll("[data-validation-viewer-key]")].filter(
    (node) => node.dataset.validationViewerKey === key && visible(node)
  );
  if (replacements.length === 1) replacements[0].focus({ preventScroll: true });
}

export function openValidationViewer(
  artifact,
  trigger,
  { loadBytes = fetchValidationReportBytes } = {}
) {
  const verified = getValidationViewerArtifact(artifact, artifact?.datasetName);
  if (!verified) throw new Error("Invalid validation artifact.");
  activeViewer?.close({ restoreFocus: false });
  const dialog = element("dialog", "pc-vld-dialog");
  dialog.setAttribute("aria-labelledby", "pc-vld-title");
  const header = element("header", "pc-vld-header");
  const titleWrap = element("div", "pc-vld-title-wrap");
  const title = element("h2", "", "Validation report");
  title.id = "pc-vld-title";
  titleWrap.append(title, element("div", "pc-vld-file-name", verified.fileName));
  const metadata = [
    verified.datasetName,
    verified.createdAtUtc && `Stored: ${formatDate(verified.createdAtUtc)}`,
    verified.revisionId && `Revision: ${verified.revisionId}`,
  ].filter(Boolean);
  titleWrap.append(element("div", "pc-vld-meta", metadata.join(" · ")));
  const actions = element("div", "pc-vld-actions");
  const download = element("a", "pc-vld-button", "Download");
  download.href = verified.url;
  download.download = verified.fileName;
  download.setAttribute("aria-label", `Download original ${verified.fileName}`);
  const closeButton = button("Close", () => close());
  closeButton.autofocus = true;
  actions.append(download, closeButton);
  header.append(titleWrap, actions);
  const body = element("div", "pc-vld-body");
  dialog.append(header, body);
  let disposed = false;
  let request = null;
  let generation = 0;
  const session = { close };
  activeViewer = session;

  function close({ restoreFocus = true } = {}) {
    if (disposed) return;
    disposed = true;
    generation++;
    request?.abort();
    window.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("pagehide", onNavigation);
    window.removeEventListener("popstate", onNavigation);
    if (dialog.open) dialog.close();
    dialog.remove();
    if (activeViewer === session) activeViewer = null;
    if (restoreFocus) restoreTriggerFocus(trigger);
  }

  function onNavigation() {
    close({ restoreFocus: false });
  }
  function onKeydown(event) {
    if (event.key !== "Escape" || disposed) return;
    // The modal has first priority over map selection, tooltips and the
    // underlying Dashboard History/Validation panel's Escape handlers.
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => close());
  // A modal backdrop is retargeted to the dialog itself. Require an actual
  // outside press and click so selecting text or dragging from the report does
  // not dismiss it, and clicks on the dialog's own padding stay inside.
  let backdropPressed = false;
  function isBackdropEvent(event) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX >= bounds.right ||
      event.clientY < bounds.top ||
      event.clientY >= bounds.bottom
    );
  }
  dialog.addEventListener("pointerdown", (event) => {
    backdropPressed = event.isPrimary && event.button === 0 && isBackdropEvent(event);
  });
  dialog.addEventListener("pointercancel", () => {
    backdropPressed = false;
  });
  dialog.addEventListener("click", (event) => {
    // Prevent the backdrop click from also dismissing the underlying report panel.
    event.stopPropagation();
    const dismiss = backdropPressed && event.detail > 0 && isBackdropEvent(event);
    backdropPressed = false;
    if (dismiss) close();
  });
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("pagehide", onNavigation);
  window.addEventListener("popstate", onNavigation);
  document.body.appendChild(dialog);
  try {
    dialog.showModal();
  } catch (error) {
    close({ restoreFocus: false });
    throw error;
  }
  void load();
  return session;

  async function load() {
    if (disposed) return;
    request?.abort();
    request = new AbortController();
    const current = ++generation;
    const signal = request.signal;
    const loading = element("p", "pc-vld-state", "Loading validation report...");
    loading.setAttribute("role", "status");
    body.setAttribute("aria-busy", "true");
    body.replaceChildren(loading);
    // A browser paint can occur while the authenticated download is in flight.
    try {
      const bytes = await loadBytes(verified, { signal });
      if (disposed || current !== generation || signal.aborted) return;
      const decoded = decodeValidationReport(bytes);
      let report = null;
      let parseError = "";
      try {
        report = parseSevenCsValidationReport(decoded.text, {
          expectedDatasetName: verified.datasetName,
        });
      } catch (error) {
        parseError =
          error instanceof Error ? error.message : "Structured report could not be read.";
      }
      if (disposed || current !== generation) return;
      renderReport(body, decoded, report, parseError);
    } catch (error) {
      if (disposed || current !== generation || signal.aborted) return;
      const state = element("div", "pc-vld-state");
      state.setAttribute("role", "alert");
      state.append(
        element("h3", "", "Report could not be loaded"),
        element(
          "p",
          "",
          error instanceof Error ? error.message : "The validation file could not be loaded."
        ),
        button("Retry", () => {
          closeButton.focus();
          void load();
        })
      );
      body.replaceChildren(state);
    } finally {
      if (!disposed && current === generation) body.setAttribute("aria-busy", "false");
    }
  }
}

function renderReport(body, decoded, report, parseError) {
  const top = element("div", "pc-vld-top");
  const mode = element("div", "pc-vld-mode");
  mode.setAttribute("role", "group");
  mode.setAttribute("aria-label", "Report view");
  const findingsButton = button("Findings", () => switchMode("findings"));
  findingsButton.disabled = !report;
  const rawButton = button("Raw file", () => switchMode("raw"));
  mode.append(findingsButton, rawButton);
  top.appendChild(mode);
  if (report)
    top.append(
      element(
        "span",
        "pc-vld-meta",
        [
          report.tool,
          report.validationStart && `Validated: ${formatDate(report.validationStart)}`,
          report.datasetFile,
        ]
          .filter(Boolean)
          .join(" · ")
      )
    );
  const panel = element("div", "pc-vld-panel");
  body.replaceChildren(top);
  if (decoded.encodingWarning) {
    const warning = element(
      "div",
      "pc-vld-warning",
      "The file contains invalid UTF-8 bytes. Replacement characters are shown in the preview; the original download is unchanged."
    );
    warning.setAttribute("role", "status");
    body.appendChild(warning);
  }
  if (parseError) {
    const warning = element(
      "div",
      "pc-vld-warning",
      `Structured view unavailable: ${parseError} The decoded raw file is available below.`
    );
    warning.setAttribute("role", "status");
    body.appendChild(warning);
  }
  body.appendChild(panel);
  let findings = null;
  let raw = null;
  function switchMode(value) {
    if (value === "findings" && !report) return;
    findingsButton.setAttribute("aria-pressed", String(value === "findings"));
    rawButton.setAttribute("aria-pressed", String(value === "raw"));
    if (value === "findings") {
      findings ??= createFindings(report);
      panel.replaceChildren(findings);
    } else {
      raw ??= createRawFile(decoded.text);
      panel.replaceChildren(raw);
    }
  }
  switchMode(report ? "findings" : "raw");
}

function createRawFile(text) {
  const container = element("section", "pc-vld-raw-view");
  const controls = element("div", "pc-vld-controls");
  const query = element("input", "pc-vld-input");
  query.type = "search";
  query.placeholder = "Find text (case-sensitive)...";
  query.setAttribute("aria-label", "Find text in raw validation file");
  const status = element("span", "pc-vld-meta");
  status.setAttribute("role", "status");
  const raw = element("textarea", "pc-vld-raw pc-scrollbar");
  raw.readOnly = true;
  raw.wrap = "off";
  raw.setAttribute("aria-label", "Decoded original validation file");
  raw.value = text;
  let lastQuery = "";
  let lastIndex = -1;
  const previous = button("Previous", () => find(-1));
  const next = button("Next", () => find(1));
  controls.append(query, previous, next, status);
  container.append(controls, raw);
  query.addEventListener("input", () => {
    previous.disabled = next.disabled = !query.value;
    status.textContent = "";
  });
  previous.disabled = next.disabled = true;
  query.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    find(event.shiftKey ? -1 : 1);
  });
  return container;

  function find(direction) {
    const term = query.value;
    if (!term) return;
    if (term !== lastQuery) lastIndex = -1;
    lastQuery = term;
    // Search the textarea value because native controls normalize CRLF to LF.
    const source = raw.value;
    let index =
      direction > 0
        ? source.indexOf(term, lastIndex < 0 ? 0 : lastIndex + term.length)
        : lastIndex === 0
          ? -1
          : source.lastIndexOf(term, lastIndex < 0 ? source.length : lastIndex - 1);
    let wrapped = false;
    if (index < 0) {
      index = direction > 0 ? source.indexOf(term) : source.lastIndexOf(term);
      wrapped = index >= 0;
    }
    lastIndex = index;
    status.textContent = index < 0 ? "No match" : wrapped ? "Search wrapped" : "Match selected";
    if (index < 0) return;
    raw.focus({ preventScroll: true });
    raw.setSelectionRange(index, index + term.length);
    const line = source.slice(0, index).split("\n").length - 1;
    const lineHeight = parseFloat(window.getComputedStyle(raw).lineHeight);
    if (Number.isFinite(lineHeight))
      raw.scrollTop = Math.max(0, line * lineHeight - raw.clientHeight / 3);
  }
}

function createFindings(report) {
  const container = element("section", "pc-vld-findings");
  const metrics = element("div", "pc-vld-metrics");
  const controls = element("div", "pc-vld-controls");
  const search = element("input", "pc-vld-input");
  search.type = "search";
  search.placeholder = "Search checks, messages, object IDs...";
  search.setAttribute("aria-label", "Search validation findings");
  const severity = element("select", "pc-vld-input");
  severity.setAttribute("aria-label", "Finding severity");
  for (const [value, label] of [
    ["failures", "Critical + Error"],
    ["all", "All severities"],
    ...VALIDATION_SEVERITIES.map((name) => [name, name]),
  ]) {
    const option = element("option", "", label);
    option.value = value;
    severity.appendChild(option);
  }
  severity.value = report.totals.Critical || report.totals.Error ? "failures" : "all";
  for (const name of VALIDATION_SEVERITIES) {
    const metric = button(
      "",
      () => {
        severity.value = severity.value === name ? "all" : name;
        update();
      },
      "pc-vld-metric"
    );
    metric.dataset.severity = name;
    metric.append(element("span", "", name), element("strong", "", count(report.totals[name])));
    metrics.appendChild(metric);
  }
  const resultCount = element("p", "pc-vld-meta pc-vld-result-count");
  resultCount.setAttribute("role", "status");
  controls.append(search, severity);
  const split = element("div", "pc-vld-split");
  const list = element("div", "pc-vld-check-list pc-scrollbar");
  list.setAttribute("role", "region");
  list.setAttribute("aria-label", "Validation checks");
  list.tabIndex = 0;
  const detail = element("section", "pc-vld-detail pc-scrollbar");
  detail.setAttribute("aria-label", "Selected check details");
  detail.tabIndex = 0;
  split.append(list, detail);
  const info = element("details", "pc-vld-report-info");
  info.append(element("summary", "", "Report metadata"));
  const infoBody = element("div", "pc-vld-info-content");
  for (const [label, entries] of [
    ["Validation parameters", report.validationParameters],
    ["Dataset metadata", report.datasetMetadata],
  ]) {
    infoBody.appendChild(element("h4", "", label));
    for (const entry of entries) infoBody.appendChild(element("div", "", entry));
  }
  info.appendChild(infoBody);
  container.append(metrics, controls, resultCount, split, info);
  let selectedId = null;
  let selection = [];
  let activeOccurrence = null;
  search.addEventListener("input", update);
  severity.addEventListener("change", update);
  update();
  return container;

  function update() {
    selection = selectValidationChecks(report, severity.value, search.value);
    if (!selection.some(({ check }) => check.id === selectedId))
      selectedId = selection[0]?.check.id ?? null;
    activeOccurrence = null;
    for (const metric of metrics.children)
      metric.setAttribute("aria-pressed", String(severity.value === metric.dataset.severity));
    resultCount.textContent = `${count(selection.length)} of ${count(report.checks.length)} checks · ${count(selection.reduce((sum, { check }) => sum + check.reportedCount, 0))} reported findings in matching checks · ${count(report.shownCount)} of ${count(report.reportedCount)} occurrences stored in this report`;
    list.replaceChildren();
    for (const item of selection) {
      const { check } = item;
      const row = button(
        "",
        () => {
          selectedId = check.id;
          activeOccurrence = null;
          updateSelection();
        },
        "pc-vld-check"
      );
      row.dataset.checkId = check.id;
      row.append(
        element("span", "pc-vld-check-name", check.name),
        element(
          "span",
          `pc-vld-severity pc-vld-severity--${check.severity.toLowerCase()}`,
          check.severity
        ),
        element("strong", "pc-vld-count", count(check.reportedCount)),
        element(
          "span",
          "pc-vld-meta",
          `${check.categories.join(" · ") || check.section} · ${count(check.occurrences.length)} available`
        )
      );
      list.appendChild(row);
    }
    updateSelection();
  }

  function updateSelection() {
    for (const row of list.children)
      row.setAttribute("aria-pressed", String(row.dataset.checkId === selectedId));
    const item = selection.find(({ check }) => check.id === selectedId);
    detail.replaceChildren();
    detail.scrollTop = 0;
    if (!item) {
      detail.appendChild(
        element(
          "p",
          "pc-vld-state",
          report.reportedCount === 0 ? "No findings were reported." : "No matching checks."
        )
      );
      return;
    }
    const { check, occurrences } = item;
    detail.append(
      element("h3", "pc-vld-detail-title", check.name),
      element(
        "p",
        "pc-vld-meta",
        `${check.section} · ${check.severity} · ${count(check.reportedCount)} reported · ${count(check.occurrences.length)} available`
      )
    );
    if (check.occurrences.length < check.reportedCount)
      detail.appendChild(
        element("p", "pc-vld-warning", "SevenCs stored only a subset of the reported occurrences.")
      );
    if (!occurrences.length) {
      detail.appendChild(
        element("p", "pc-vld-state", "No occurrence details are available for this check.")
      );
      return;
    }
    const nav = element("div", "pc-vld-occurrence-nav");
    const label = element("span", "pc-vld-meta");
    const prev = button("Previous", () => showOccurrence(activeOccurrence - 1));
    const next = button("Next", () => showOccurrence(activeOccurrence + 1));
    const content = element("div", "pc-vld-occurrence");
    nav.append(prev, label, next);
    detail.append(nav, content);
    function showOccurrence(index) {
      if (index < 0 || index >= occurrences.length) return;
      activeOccurrence = index;
      prev.disabled = index === 0;
      next.disabled = index === occurrences.length - 1;
      label.textContent = `Occurrence ${count(index + 1)} of ${count(occurrences.length)}${occurrences.length < check.occurrences.length ? " matching" : " available"}`;
      if (document.activeElement === prev && prev.disabled) next.focus({ preventScroll: true });
      if (document.activeElement === next && next.disabled) prev.focus({ preventScroll: true });
      renderOccurrence(content, occurrences[index]);
    }
    showOccurrence(0);
  }
}

function renderOccurrence(content, occurrence) {
  content.replaceChildren();
  labeledText(content, "Category", occurrence.category);
  labeledText(content, "Message", occurrence.message);
  labeledText(content, "Suggested solution", occurrence.solution);
  if (occurrence.references.length) {
    content.appendChild(element("h4", "pc-vld-field-label", "References"));
    const references = element("ul", "pc-vld-references");
    for (const reference of occurrence.references)
      references.appendChild(element("li", "", reference));
    content.appendChild(references);
  }
  appendObjects(content, "Objects", occurrence.objects, true);
  appendObjects(content, "Related objects", occurrence.relatedObjects, false);
}

function appendObjects(content, title, objects, expanded) {
  if (!objects.length) return;
  const details = element("details", "pc-vld-objects");
  details.open = expanded;
  details.appendChild(element("summary", "", `${title} (${count(objects.length)})`));
  const tableWrap = element("div", "pc-vld-object-table-wrap");
  const table = element("table", "pc-vld-object-table");
  const head = element("thead");
  const heading = element("tr");
  for (const label of ["Product", "Object", "Type", "ID", "Position"]) {
    const cell = element("th", "", label);
    cell.scope = "col";
    heading.appendChild(cell);
  }
  head.appendChild(heading);
  const rows = element("tbody");
  table.append(head, rows);
  tableWrap.appendChild(table);
  const nav = element("div", "pc-vld-occurrence-nav");
  const label = element("span", "pc-vld-meta");
  let page = 0;
  const previous = button("Previous", () => renderPage(page - 1));
  const next = button("Next", () => renderPage(page + 1));
  nav.append(previous, label, next);
  details.append(tableWrap);
  if (objects.length > OBJECT_PAGE_SIZE) details.appendChild(nav);
  content.appendChild(details);
  renderPage(0);
  function renderPage(index) {
    if (index < 0 || index * OBJECT_PAGE_SIZE >= objects.length) return;
    page = index;
    const start = page * OBJECT_PAGE_SIZE;
    const end = Math.min(start + OBJECT_PAGE_SIZE, objects.length);
    rows.replaceChildren();
    for (const object of objects.slice(start, end)) {
      const row = element("tr");
      for (const value of [
        object.cellName,
        object.name || object.classToken,
        object.type,
        object.id,
        [object.latitude, object.longitude].filter(Boolean).join(" · "),
      ])
        row.appendChild(element("td", "", value || "—"));
      rows.appendChild(row);
    }
    label.textContent = `${count(start + 1)}–${count(end)} of ${count(objects.length)}`;
    previous.disabled = page === 0;
    next.disabled = end === objects.length;
    if (document.activeElement === previous && previous.disabled)
      next.focus({ preventScroll: true });
    if (document.activeElement === next && next.disabled) previous.focus({ preventScroll: true });
  }
}
