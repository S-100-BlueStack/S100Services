import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { createLoaderProgressSession } from "./loaderProgressSession.js";
import { hideLoader, showLoader } from "./loader.js";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

const loaderText = { textContent: "", style: {} };
const progressLabel = { textContent: "", style: {} };
const progressFill = { style: {} };
const progress = {
  classList: createClassList(),
  attributes: new Map(),
  querySelector: (selector) => (selector === ".loader-progress__fill" ? progressFill : null),
  setAttribute(name, value) {
    this.attributes.set(name, value);
  },
  removeAttribute(name) {
    this.attributes.delete(name);
  },
};
const loaderContent = { querySelector: () => null };
const loader = {
  classList: createClassList(["hidden"]),
  querySelector: (selector) => (selector === ".loader-content" ? loaderContent : null),
};
const elements = new Map([
  ["app-loader", loader],
  ["loader-text", loaderText],
  ["loader-progress", progress],
  ["loader-progress-label", progressLabel],
]);

let nextTimerId = 0;
let reduceMotion = false;
const timeouts = new Map();
const intervals = new Map();
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalAnimationFrame = globalThis.requestAnimationFrame;

globalThis.window = {
  setTimeout(callback, delay) {
    const id = ++nextTimerId;
    timeouts.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) {
    timeouts.delete(id);
  },
  setInterval(callback, delay) {
    const id = ++nextTimerId;
    intervals.set(id, { callback, delay });
    return id;
  },
  clearInterval(id) {
    intervals.delete(id);
  },
  matchMedia: () => ({ matches: reduceMotion }),
};
globalThis.document = {
  getElementById: (id) => elements.get(id) ?? null,
};
globalThis.requestAnimationFrame = (callback) => callback();

function fireTimeout(delay) {
  const entry = [...timeouts.entries()].reverse().find(([, timer]) => timer.delay === delay);
  assert.ok(entry, `Expected ${delay} ms timeout`);
  timeouts.delete(entry[0]);
  entry[1].callback();
  return entry[1].callback;
}

beforeEach(() => {
  hideLoader();
  timeouts.clear();
  intervals.clear();
  loader.classList.add("hidden");
  progress.attributes.clear();
  reduceMotion = false;
});

after(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.requestAnimationFrame = originalAnimationFrame;
});

function createVisibleSession(options = {}) {
  return createLoaderProgressSession({
    showLoaderOnStart: true,
    completionHoldMs: 300,
    ...options,
  });
}

test("initial map readiness keeps one determinate progress bar until completion", () => {
  const session = createVisibleSession();
  session.startLoading("Loading data...");
  session.updateProgressStage({ progress: 0.96, text: "Data sources loaded (2/2)..." });

  session.updateProgressStage({
    preserveProgress: true,
    text: "Finishing initial map display...",
  });

  assert.equal(loaderText.textContent, "Finishing initial map display...");
  assert.equal(progress.attributes.get("aria-valuenow"), "96");
  assert.equal(progressFill.style.width, "96%");
  assert.equal(progressLabel.textContent, "Working...");
  assert.equal(progress.classList.contains("is-indeterminate"), false);
  assert.equal(progress.classList.contains("is-waiting"), true);
  assert.equal(progress.attributes.get("aria-busy"), "true");

  session.complete({ text: "Map ready" });
  assert.equal(progress.attributes.get("aria-valuenow"), "100");
  assert.equal(progressFill.style.width, "100%");
  assert.equal(loader.classList.contains("hidden"), false);
  fireTimeout(300);
  assert.equal(loader.classList.contains("hidden"), true);
});

test("pending backend work stays indeterminate until measured stage progress is available", () => {
  const session = createVisibleSession();
  session.startLoading("Loading data...");
  assert.equal(progress.attributes.has("aria-valuenow"), false);
  assert.equal(progress.classList.contains("is-indeterminate"), true);
  assert.equal(progressLabel.textContent, "Working...");
  assert.equal(progress.attributes.get("aria-busy"), "true");
  assert.equal(
    [...intervals.values()].some(({ delay }) => delay === 350),
    false
  );

  session.markDataReceived();
  assert.equal(progress.classList.contains("is-indeterminate"), false);
  assert.equal(progress.classList.contains("is-waiting"), false);
  assert.equal(progress.attributes.get("aria-valuenow"), "18");
  session.cleanup();
});

test("map readiness does not advance unresolved source progress or restart the bar", () => {
  const session = createVisibleSession();
  session.startLoading("Loading data...");
  session.updateProgressStage({ progress: 0.74, text: "Loading data sources (1/2)..." });
  session.updateProgressStage({ preserveProgress: true, text: "Finishing initial map display..." });

  assert.equal(progress.attributes.get("aria-valuenow"), "74");
  assert.equal(progressFill.style.width, "74%");
  assert.equal(progressLabel.textContent, "Working...");
  assert.equal(progress.classList.contains("is-waiting"), true);
  assert.equal(progress.classList.contains("is-indeterminate"), false);
  session.cleanup();
});

test("completion exposes the actual 100% state before a short dismissal", () => {
  const session = createVisibleSession();
  session.startLoading("Loading...");
  assert.equal(loader.classList.contains("hidden"), false);

  session.complete({ text: "Analyze ready" });
  assert.equal(loaderText.textContent, "Analyze ready");
  assert.equal(progress.attributes.get("aria-valuenow"), "100");
  assert.equal(progressLabel.textContent, "100%");
  assert.equal(progress.classList.contains("is-waiting"), false);
  assert.equal(progress.attributes.get("aria-busy"), "false");
  assert.equal(loader.classList.contains("hidden"), false);

  fireTimeout(300);
  assert.equal(loader.classList.contains("hidden"), true);
});

test("Main map startup awaits an already visible completion before it becomes ready", async () => {
  showLoader("Preparing UI components...", { progress: 0.01 });
  const session = createLoaderProgressSession({ completionHoldMs: 300 });
  session.startLoading("Loading data...");
  let completed = false;
  const pending = session.complete({ text: "Map ready" });
  pending.then(() => {
    completed = true;
  });

  assert.equal(loader.classList.contains("hidden"), false);
  assert.equal(loaderText.textContent, "Map ready");
  await Promise.resolve();
  assert.equal(completed, false);
  fireTimeout(300);
  await pending;
  assert.equal(completed, true);
  assert.equal(loader.classList.contains("hidden"), true);
});

test("completion remains immediate unless a workflow opts in", () => {
  const session = createVisibleSession({ completionHoldMs: 0 });
  session.startLoading("Loading...");
  session.complete();
  assert.equal(loader.classList.contains("hidden"), true);
  assert.equal(
    [...timeouts.values()].some(({ delay }) => delay === 300),
    false
  );
});

test("fast loads never reveal or hold an otherwise hidden loader", () => {
  const session = createVisibleSession({ showLoaderDelayMs: 350 });
  session.startLoading("Loading...");
  assert.equal(loader.classList.contains("hidden"), true);

  session.complete({ text: "Analyze ready" });
  assert.equal(loader.classList.contains("hidden"), true);
  assert.equal(
    [...timeouts.values()].some(({ delay }) => delay === 300 || delay === 350),
    false
  );
});

test("reduced-motion preferences skip the completion hold", () => {
  reduceMotion = true;
  const session = createVisibleSession();
  session.startLoading("Loading...");
  session.complete();

  assert.equal(loader.classList.contains("hidden"), true);
  assert.equal(
    [...timeouts.values()].some(({ delay }) => delay === 300),
    false
  );
});

test("a completed session cannot hide a newer request", () => {
  const older = createVisibleSession();
  older.startLoading("Earlier request");
  older.complete();
  const staleHide = [...timeouts.values()].find(({ delay }) => delay === 300)?.callback;
  assert.equal(typeof staleHide, "function");

  const newer = createVisibleSession();
  newer.startLoading("New request");
  staleHide();
  assert.equal(loader.classList.contains("hidden"), false);

  newer.complete();
  fireTimeout(300);
  assert.equal(loader.classList.contains("hidden"), true);
});

test("stale progress and completion do not overwrite the active session", () => {
  const older = createVisibleSession();
  older.startLoading("Earlier request");

  const newer = createVisibleSession();
  newer.startLoading("New request");
  const currentProgress = progress.attributes.get("aria-valuenow");
  const activeIntervals = intervals.size;

  older.handleRenderProgress({ progress: 1 });
  older.complete({ text: "Stale completion" });
  assert.equal(progress.attributes.get("aria-valuenow"), currentProgress);
  assert.equal(loaderText.textContent, "New request");
  assert.equal(intervals.size, activeIntervals);
  assert.equal(loader.classList.contains("hidden"), false);

  newer.cleanup();
});

test("cleanup cancels dismissal and resolves pending startup waits", async () => {
  const session = createVisibleSession();
  session.startLoading("Loading...");
  const pending = session.complete();
  session.cleanup();
  await pending;

  assert.equal(
    [...timeouts.values()].some(({ delay }) => delay === 300),
    false
  );
  assert.equal(loader.classList.contains("hidden"), false);
});

test("failure dismissal cannot hide a newer loader", () => {
  const older = createVisibleSession();
  older.startLoading("Loading...");
  older.fail({ hideAfterMs: 1500 });
  const staleHide = [...timeouts.values()].find(({ delay }) => delay === 1500)?.callback;
  assert.equal(typeof staleHide, "function");

  const newer = createVisibleSession();
  newer.startLoading("New request");
  staleHide();
  assert.equal(loader.classList.contains("hidden"), false);
  newer.cleanup();
});
