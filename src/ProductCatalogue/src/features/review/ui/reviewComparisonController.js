import {
  getReviewSynchronizedScrollTop,
  projectReviewComparison,
} from "../domain/reviewComparison.js";

// Review owns scroll listeners; Preferences supplies the current opt-in value.
// No controls or metadata are injected into the board.
export function createReviewComparisonController() {
  let syncScrolling = false;
  const expectedScroll = new WeakMap();
  let board = null;
  let entries = [];
  let listeners = [];

  function disconnect() {
    for (const remove of listeners) remove();
    listeners = [];
    board = null;
    entries = [];
  }

  function listen(element, type, callback) {
    element.addEventListener(type, callback);
    listeners.push(() => element.removeEventListener(type, callback));
  }

  function connect(nextBoard) {
    disconnect();
    if (!nextBoard) return;
    board = nextBoard;
    entries = [...board.querySelectorAll(".pc-review-column")]
      .map(createColumnEntry)
      .filter(Boolean);

    for (const entry of entries) {
      // Scroll does not bubble. Listen to the outer column only, not nested History
      // and report bodies, so independent reading positions are preserved.
      listen(entry.scroll, "scroll", () => synchronize(entry));
    }
    rememberScrollPositions();
  }

  // DOM reconciliation may clamp a scroll position.
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
    if (!syncScrolling || !board?.contains(source.scroll)) return;
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

  function setSyncScrolling(enabled) {
    syncScrolling = enabled === true;
    // Enabling the setting must not move columns until the next user scroll.
    rememberScrollPositions();
  }

  return { connect, setSyncScrolling, destroy: disconnect };
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
