import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { localHistoryTimeLabel } from "../../../shared/domain/historyPresentation.js";
import { mountPackageCommentControls } from "./createPackageCommentControls.js";

class Element extends EventTarget {
  children = [];
  attrs = new Map();
  style = {};
  offsetWidth = 300;
  offsetHeight = 180;

  constructor(tagName) {
    super();
    this.tagName = tagName;
  }
  append(...items) {
    this.children.push(...items);
    for (const item of items) item.parent = this;
  }
  before(item) {
    this.parent.children.splice(this.parent.children.indexOf(this), 0, item);
    item.parent = this.parent;
  }
  replaceChildren(...items) {
    this.children = items;
  }
  setAttribute(key, value) {
    this.attrs.set(key, value);
  }
  removeAttribute(key) {
    this.attrs.delete(key);
  }
  contains(item) {
    return item === this || this.children.some((child) => child.contains(item));
  }
  getBoundingClientRect() {
    return this.rect ?? { left: 25, top: 100, bottom: 125 };
  }
  showPopover() {
    this.inTopLayer = true;
  }
  hidePopover() {
    this.inTopLayer = false;
  }
  focus() {
    document.activeElement = this;
  }
}

test("Live toolbar mounts reasons and direct Discard before existing controls and preserves mock", async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.window = Object.assign(new EventTarget(), { innerWidth: 900, innerHeight: 650 });
  globalThis.document = Object.assign(new EventTarget(), {
    createElement: (tagName) => new Element(tagName),
    defaultView: globalThis.window,
  });
  const calls = [];
  const requests = [];
  const profiles = [];
  const state = {
    feature: { id: "p" },
    record: { assignmentStatus: "notAssigned", relations: {} },
    draft: {},
  };
  let controls;
  let complete;
  let settled = 0;
  try {
    const toolbar = new Element("toolbar");
    const activeCount = new Element("span");
    const showActive = new Element("button");
    const save = new Element("button");
    toolbar.append(activeCount, showActive, save);
    const list = new Element("list");
    const options = {
      firstExistingControl: activeCount,
      session: {
        changePackageDecision(kind, reason) {
          calls.push([kind, reason]);
          return new Promise((resolve) => {
            complete = resolve;
          });
        },
      },
      onDecisionSettled() {
        settled++;
      },
      read(id, { before, signal }) {
        return new Promise((resolve, reject) =>
          requests.push({ id, before, signal, resolve, reject })
        );
      },
      readProfile(id, eventId, { actor, signal }) {
        return new Promise((resolve) => profiles.push({ id, eventId, actor, signal, resolve }));
      },
    };
    assert.equal(mountPackageCommentControls({ ...options, live: false }), null);
    assert.deepEqual(toolbar.children, [activeCount, showActive, save]);
    controls = mountPackageCommentControls({ ...options, live: true });
    assert.deepEqual(toolbar.children, [controls.element, activeCount, showActive, save]);
    assert.equal(list.children.length, 0);
    controls.update(state);
    const [reasons, discard, popup] = controls.element.children;
    const heading = popup.children.find((child) => child.tagName === "h3");
    const input = popup.children.find((child) => child.tagName === "textarea");
    const status = popup.children.find((child) => child.attrs.get("role") === "status");
    const history = popup.children.find((child) => child.attrs.get("role") === "region");
    const retry = popup.children.find((child) => child.textContent === "Retry");
    const older = history.children.find((child) => child.textContent === "Load older");
    const listOfReasons = history.children.find((child) => child.tagName === "ol");
    const actions = popup.children.find((child) =>
      child.children.some((button) => button.textContent === "Cancel")
    );
    const [cancel, confirm] = actions.children;
    const click = (element) => element.dispatchEvent(new Event("click"));
    const escape = () => {
      const event = new Event("keydown", { cancelable: true });
      Object.defineProperty(event, "key", { value: "Escape" });
      popup.dispatchEvent(event);
    };
    click(reasons);
    assert.equal(input.hidden, true);
    assert.equal(heading.textContent, "Discard reasons");
    assert.equal(popup.inTopLayer, true);
    assert.equal(document.activeElement, heading);
    assert.equal(actions.hidden, true);
    assert.equal(
      actions.children.some((child) => child.textContent === "Close"),
      false
    );
    assert.equal(popup.style.top, "129px");
    assert.equal(requests.length, 1);
    escape();
    assert.equal(document.activeElement, reasons);
    assert.equal(requests[0].signal.aborted, true);

    click(discard);
    assert.equal(input.hidden, false);
    assert.equal(heading.textContent, "Discard Package");
    assert.deepEqual(
      actions.children.filter((item) => !item.hidden).map((item) => item.textContent),
      ["Cancel", "Discard"]
    );
    assert.equal(status.textContent, "");
    assert.equal(confirm.disabled, true);
    for (const invalid of ["   ", "a".repeat(4001)]) {
      input.value = invalid;
      input.dispatchEvent(new Event("input"));
      click(confirm);
    }
    assert.equal(calls.length, 0);
    input.value = "Unsent";
    input.dispatchEvent(new Event("input"));
    click(cancel);
    assert.equal(popup.hidden, true);
    click(discard);
    assert.equal(input.value, "");
    input.value = "A fresh reason";
    input.dispatchEvent(new Event("input"));
    click(confirm);
    click(confirm);
    escape();
    assert.deepEqual(calls, [["discardReason", "A fresh reason"]]);
    assert.equal(popup.hidden, false);
    complete(true);
    await new Promise(setImmediate);
    assert.equal(popup.hidden, true);
    assert.equal(settled, 1);
    assert.equal(document.activeElement, discard);
    requests[0].resolve({ items: [], nextBefore: null });

    click(reasons);
    assert.equal(status.textContent, "Loading saved discard reasons…");
    requests[1].reject(new Error("Fixture read error"));
    await new Promise(setImmediate);
    assert.equal(status.textContent, "Fixture read error");
    assert.equal(retry.hidden, false);
    retry.focus();
    click(retry);
    assert.equal(document.activeElement, heading);
    assert.equal(retry.hidden, true);

    const item = {
      id: "op",
      historyEventId: "event",
      kind: "discardReason",
      text: "<b>Saved reason</b>",
      actor: "PROD\\reader",
      occurredAtUtc: "2026-11-26T12:35:00Z",
    };
    requests[2].resolve({
      items: [item, { ...item, id: "earlier", text: "Earlier reason" }],
      nextBefore: "earlier",
    });
    await new Promise(setImmediate);
    assert.equal(input.hidden, true);
    assert.equal(actions.hidden, true);
    assert.equal(listOfReasons.children.length, 2);
    const [time, attribution, text] = listOfReasons.children[0].children;
    assert.deepEqual(
      listOfReasons.children[0].children.map((child) => child.tagName),
      ["time", "div", "p"]
    );
    assert.equal(time.dateTime, item.occurredAtUtc);
    assert.equal(time.textContent, localHistoryTimeLabel(item.occurredAtUtc));
    assert.equal(text.textContent, item.text);
    assert.equal(
      attribution.children.find((child) => child.tagName === "span").textContent,
      "reader"
    );
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].eventId, "event");

    // Give positioning a constrained viewport and simulated overflow. No new fetch follows resize.
    reasons.rect = { left: 25, top: 280, bottom: 305 };
    window.innerHeight = 320;
    popup.scrollHeight = 310;
    popup.clientHeight = 272;
    window.dispatchEvent(new Event("resize"));
    assert.equal(popup.style.top, "96px");
    assert.equal(popup.style.maxHeight, "268px");
    assert.equal(popup.tabIndex, 0);
    assert.equal(requests.length, 3);

    older.focus();
    click(older);
    click(older);
    assert.equal(requests.length, 4);
    assert.equal(requests[3].before, "earlier");
    requests[3].resolve({ items: [], nextBefore: null });
    await new Promise(setImmediate);
    assert.equal(older.hidden, true);
    assert.equal(document.activeElement, heading);
    document.dispatchEvent(new Event("pointerdown"));
    assert.equal(popup.hidden, true);
    assert.equal(profiles[0].signal.aborted, true);
    profiles[0].resolve({ displayName: "Late name" });
    await new Promise(setImmediate);
    assert.equal(
      attribution.children.find((child) => child.tagName === "span").textContent,
      "reader"
    );

    click(reasons);
    requests[4].resolve({ items: [], nextBefore: null });
    await new Promise(setImmediate);
    assert.equal(status.textContent, "No saved discard reasons.");
    click(reasons);
    assert.equal(popup.hidden, true);
    assert.equal(document.activeElement, reasons);

    click(reasons);
    assert.equal(requests[5].id, "p");
    controls.update({ ...state, feature: { id: "other" } });
    assert.equal(requests[5].signal.aborted, true);
    requests[5].resolve({ items: [item], nextBefore: null });
    await new Promise(setImmediate);
    assert.equal(popup.hidden, true);
    assert.equal(listOfReasons.children.length, 0);
    assert.equal(requests.length, 6);
    assert.equal(profiles.length, 1);

    controls.update({ ...state, record: { ...state.record, assignmentStatus: "discarded" } });
    assert.equal(discard.textContent, "Reopen");
    click(discard);
    assert.equal(popup.hidden, true);
    assert.equal(calls.at(-1)[0], "reopen");
    complete(true);
    await new Promise(setImmediate);
    assert.equal(settled, 2);
  } finally {
    controls?.destroy();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("Discard reason timestamps default to the browser zone with fixed English formatting", () => {
  const moduleUrl = new URL("../../../shared/domain/historyPresentation.js", import.meta.url);
  const source = `
    import { localHistoryTimeLabel, historyTimeLabel } from ${JSON.stringify(moduleUrl.href)};
    const winter = "2026-11-26T12:35:00Z";
    console.log(JSON.stringify([
      localHistoryTimeLabel(winter),
      localHistoryTimeLabel("2026-07-15T12:35:00Z"),
      localHistoryTimeLabel("2026-11-26T01:05:00Z"),
      localHistoryTimeLabel("invalid"),
      historyTimeLabel(winter)
    ]));
  `;
  for (const [zone, expected] of [
    ["Europe/Copenhagen", ["26 Nov 2026, 13:35", "15 Jul 2026, 14:35", "26 Nov 2026, 02:05"]],
    ["UTC", ["26 Nov 2026, 12:35", "15 Jul 2026, 12:35", "26 Nov 2026, 01:05"]],
    ["America/Los_Angeles", ["26 Nov 2026, 04:35", "15 Jul 2026, 05:35", "25 Nov 2026, 17:05"]],
  ]) {
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
      env: { ...process.env, TZ: zone },
      encoding: "utf8",
    });
    assert.deepEqual(JSON.parse(output), [
      ...expected,
      "Date unavailable",
      "26 Nov 2026, 12:35 UTC",
    ]);
  }
});
