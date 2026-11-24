import { getStatusName } from "../../data/stores/statusStore.js";
import { applyProductStatusTone } from "../../../shared/ui/productStatusTone.js";
import {
  getReviewMetadataDifferences,
  getReviewSynchronizedScrollTop,
  projectReviewComparison,
} from "../domain/reviewComparison.js";

// The page owns one comparison session. It never loads or modifies Product data,
// and reattaches only to the application-owned DOM published by the existing board.
export function createReviewComparisonController() {
  const options = { syncScrolling: false, highlightDifferences: false };
  const expectedScroll = new WeakMap();
  let board = null;
  let entries = [];
  let controls = new Map();
  let listeners = [];

  function disconnect() {
    for (const remove of listeners) remove();
    listeners = [];
    clearDifferences();
    board?.querySelector(".pc-review-comparison")?.remove();
    board?.classList.remove("pc-review-board--comparison");
    board = null;
    entries = [];
    controls = new Map();
  }

  function listen(element, type, callback) {
    element.addEventListener(type, callback);
    listeners.push(() => element.removeEventListener(type, callback));
  }

  function connect(nextBoard, activeElement) {
    const focusKey = [...controls].find(([, input]) => input === activeElement)?.[0];
    disconnect();
    if (!nextBoard) return;
    board = nextBoard;
    entries = [...board.querySelectorAll(".pc-review-column")]
      .map(createColumnEntry)
      .filter(Boolean);

    const toolbar = document.createElement("fieldset");
    toolbar.className = "pc-review-comparison";
    const legend = document.createElement("legend");
    legend.textContent = "Compare";
    toolbar.appendChild(legend);
    for (const [key, text] of [
      ["syncScrolling", "Sync scrolling"],
      ["highlightDifferences", "Highlight differences"],
    ]) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = options[key];
      controls.set(key, input);
      listen(input, "change", () => {
        options[key] = input.checked;
        if (key === "highlightDifferences") updateDifferences();
        rememberScrollPositions();
      });
      const caption = document.createElement("span");
      caption.textContent = text;
      label.append(input, caption);
      toolbar.appendChild(label);
    }
    board.classList.add("pc-review-board--comparison");
    board.prepend(toolbar);
    for (const entry of entries) {
      // Scroll does not bubble. Listen to the outer column only, not nested History
      // and report bodies, so independent reading positions are preserved.
      listen(entry.scroll, "scroll", () => synchronize(entry));
    }
    updateDifferences();
    rememberScrollPositions();
    controls.get(focusKey)?.focus({ preventScroll: true });
  }

  // DOM reconciliation and metadata changes may also clamp a scroll position.
  // Treat their current positions as passive, not as a new user scroll command.
  function rememberScrollPositions() {
    for (const entry of entries) expectedScroll.set(entry.scroll, entry.scroll.scrollTop);
  }

  function synchronize(source) {
    const top = source.scroll.scrollTop;
    const expected = expectedScroll.get(source.scroll);
    expectedScroll.delete(source.scroll);
    // Setting scrollTop schedules a native event. Ignore the resulting echo even
    // when the peer had to clamp the requested position to its own scroll range.
    if (expected !== undefined && Math.abs(expected - top) < 0.5) return;
    if (!options.syncScrolling || !board?.contains(source.scroll)) return;
    const anchors = readAnchors(source);
    const updates = [];
    for (const target of entries) {
      if (target === source || target.projection.scrollGroup !== source.projection.scrollGroup) {
        continue;
      }
      const maximum = Math.max(0, target.scroll.scrollHeight - target.scroll.clientHeight);
      const next = getReviewSynchronizedScrollTop(anchors, readAnchors(target), top, maximum);
      if (next === null || Math.abs(next - target.scroll.scrollTop) < 0.5) continue;
      updates.push({ target, next });
    }
    // Measure all peers before writing, to avoid interleaved layout reads and writes.
    for (const { target, next } of updates) {
      target.scroll.scrollTop = next;
      expectedScroll.set(target.scroll, target.scroll.scrollTop);
    }
  }

  function clearDifferences() {
    for (const entry of entries) {
      for (const marker of entry.column.querySelectorAll(".pc-review-comparison-marker")) {
        marker.parentElement.classList.remove("pc-review-comparison-difference");
        marker.remove();
      }
      entry.column.querySelector(".pc-review-comparison-metadata")?.remove();
    }
  }

  function updateDifferences() {
    clearDifferences();
    if (!options.highlightDifferences) return;
    const differences = getReviewMetadataDifferences(entries.map((entry) => entry.projection));
    for (const entry of entries) {
      for (const { member, root } of entry.members) {
        const fields = differences.get(member.identity);
        if (!fields?.size) continue;
        const metadata = member.memberKey ? root : createOrdinaryMetadata(entry.column, member);
        if (!metadata) continue;
        for (const field of fields) {
          const chip = metadata.querySelector(`.pc-review-member__${field}`);
          if (!chip || member[field] === null) continue;
          chip.classList.add("pc-review-comparison-difference");
          const marker = document.createElement("span");
          marker.className = "pc-review-comparison-marker";
          marker.textContent = " ≠";
          const description = document.createElement("span");
          description.className = "pc-review-comparison-marker__description";
          description.textContent = ` (${field} differs across comparable Products)`;
          marker.appendChild(description);
          chip.appendChild(marker);
        }
      }
    }
  }

  return { connect, rememberScrollPositions, destroy: disconnect };
}

function createColumnEntry(column) {
  const projection = projectReviewComparison(column.reviewRenderProduct);
  const scroll = column.querySelector(".pc-review-column__content");
  if (!projection || !scroll) return null;
  const sections = [...scroll.querySelectorAll(".pc-review-member")];
  const members = projection.members.map((member) => ({
    member,
    root: member.memberKey
      ? sections.find((section) => section.dataset.reviewMemberKey === member.memberKey)
      : scroll,
  }));
  if (members.some(({ root }) => !root)) return null;
  return { column, scroll, projection, members };
}

function readAnchors(entry) {
  const origin = entry.scroll.getBoundingClientRect().top + entry.scroll.clientTop;
  const anchors = [];
  for (const { member, root } of entry.members) {
    const header = root.querySelector(".pc-review-member__header");
    if (header) addAnchor(header, "member-header");
    for (const card of root.querySelectorAll(".pc-review-content-card")) {
      addAnchor(card, card.dataset.reviewContentType);
    }
    function addAnchor(element, type) {
      const rect = element.getBoundingClientRect();
      if (rect.height <= 0) return;
      anchors.push({
        key: JSON.stringify([member.groupKey, type]),
        top: rect.top - origin + entry.scroll.scrollTop,
        height: rect.height,
      });
    }
  }
  return anchors;
}

function createOrdinaryMetadata(column, member) {
  const header = column.querySelector(".pc-review-column__header");
  if (!header) return null;
  const metadata = document.createElement("div");
  metadata.className = "pc-review-member__meta pc-review-comparison-metadata";
  if (member.status !== null) {
    const status = document.createElement("span");
    status.className = "pc-review-member__status";
    status.textContent = String(getStatusName(member.status) ?? member.status);
    applyProductStatusTone(status, member.status);
    metadata.appendChild(status);
  }
  if (member.edition !== null) {
    const edition = document.createElement("span");
    edition.className = "pc-review-member__edition";
    edition.textContent = `Edition ${member.edition}`;
    metadata.appendChild(edition);
  }
  header.appendChild(metadata);
  return metadata;
}
