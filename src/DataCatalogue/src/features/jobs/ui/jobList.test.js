import assert from "node:assert/strict";
import test from "node:test";
import { createJobList } from "./jobList.js";
import { createJobsOverlay } from "../../../app/ui/createJobsOverlay.js";
import { createJobStore } from "../state/jobStore.js";

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = new Map();
    this.className = "";
    this.textContent = "";
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name) || this.className.split(" ").includes(name),
      toggle: (name, forced) => {
        if (forced) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }

  append(...children) {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  contains(other) {
    return this === other || this.children.some((child) => child.contains(other));
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (selector === "[data-job-focus]" && node.dataset.jobFocus) return node;
      if (selector === "[data-job-id]" && node.dataset.jobId) return node;
      node = node.parent;
    }
    return null;
  }

  matches(selector) {
    return selector === ":focus-visible" && this.focusVisible === true;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(name, listener) {
    const existing = this.listeners.get(name) ?? [];
    this.listeners.set(name, [...existing, listener]);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }

  querySelectorAll(selector) {
    if (selector === "[data-job-details-id]")
      return descendants(this).filter((element) => element.dataset.jobDetailsId);
    if (selector === "[data-job-id]")
      return descendants(this).filter((element) => element.dataset.jobId);
    if (selector === "[data-job-focus]")
      return descendants(this).filter((element) => element.dataset.jobFocus);
    return [];
  }

  focus() {
    this.focused = true;
    if (globalThis.document) globalThis.document.activeElement = this;
  }

  scrollIntoView() {}
}

function descendants(root) {
  return root.children.flatMap((child) => [child, ...descendants(child)]);
}

function findByClass(root, name) {
  return descendants(root).filter((element) => element.classList.contains(name));
}

function findByTag(root, tag) {
  return descendants(root).filter((element) => element.tagName === tag);
}

function elementText(root) {
  return [root.textContent, ...root.children.map(elementText)].join(" ");
}

function assertRefreshIconButton(root, { disabled = false } = {}) {
  const buttons = findByClass(root, "job-list__refresh-button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].tagName, "button");
  assert.equal(buttons[0].type, "button");
  assert.equal(
    buttons[0].attributes.get("aria-label"),
    disabled ? "Refreshing Packages" : "Refresh Packages"
  );
  assert.equal(buttons[0].title, disabled ? "Refreshing Packages" : "Refresh Packages");
  assert.equal(buttons[0].disabled, disabled);
  assert.equal(buttons[0].textContent, "");
  assert.equal(findByTag(buttons[0], "calcite-icon")[0].icon, "refresh");
  assert.equal(findByTag(buttons[0], "calcite-icon")[0].attributes.get("aria-hidden"), "true");
  return buttons[0];
}

function withDocument(run) {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  globalThis.document = { createElement: (name) => new TestElement(name) };
  globalThis.window = { requestAnimationFrame: (callback) => callback() };
  try {
    return run();
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  }
}

function fixture(source) {
  const job = {
    id: '["package","enc","east"]',
    source,
    title: source === "live" ? "NM1000 · Harbour notice" : "Mock survey",
    packageId: "package",
    shortId: "NM1000",
    packageTitle: "Harbour notice",
    pipelineName: "ENC",
    workspaceName: "Eastern Denmark",
    severity: "9007199254740993",
    status: "todo",
    priority: "high",
    relatedAoiIds: ["ao1"],
    createdAt: "2026-10-01T00:00:00Z",
    deadline: null,
  };
  const snapshot = { jobs: [job], isLoading: false, error: null };
  return {
    job,
    store: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listener(snapshot);
        return () => {};
      },
    },
  };
}

test("Live Jobs list uses contextual shortId cards without redundant expansion controls", () => {
  withDocument(() => {
    const { store } = fixture("live");
    const view = createJobList({ store, sourceMode: "live" });
    const card = findByClass(view.element, "job-card")[0];
    assert.equal(findByClass(view.element, "job-card__expand-action").length, 0);
    assert.equal(findByClass(view.element, "job-card__details-action").length, 1);
    assert.equal(findByClass(view.element, "job-card__title")[0].textContent, "NM1000");
    assert.equal(
      findByClass(view.element, "job-card__context")[0].textContent,
      "ENC / Eastern Denmark"
    );
    assert.equal(findByClass(view.element, "job-card__date-chip").length, 0);
    assert.equal(findByClass(view.element, "job-card__actions").length, 1);
    assert.equal(
      findByTag(view.element, "calcite-button").filter((e) => e.textContent === "Expand all")
        .length,
      0
    );
    assert.equal(card.dataset.jobId, '["package","enc","east"]');
    view.destroy();
  });
});

test("Live Job Details show unique context and editable status without duplicate facts", () => {
  withDocument(() => {
    const { store } = fixture("live");
    const view = createJobList({ store, sourceMode: "live" });
    const detailsAction = findByClass(view.element, "job-card__details-action")[0];
    detailsAction.dispatchEvent({ type: "click" });

    const details = findByClass(view.element, "job-details")[0];
    assert.equal(details.focused, true);
    assert.equal(findByClass(view.element, "job-details__title")[0].textContent, "NM1000");
    assert.equal(
      findByClass(view.element, "job-details__package-title")[0].textContent,
      "Harbour notice"
    );
    assert.equal(findByClass(view.element, "job-details__status")[0].textContent, "Open");
    assert.equal(
      findByClass(view.element, "job-card__priority")[0].textContent,
      "Severity 9007199254740993"
    );
    const facts = findByClass(view.element, "job-details__fact-label").map(
      (item) => item.textContent
    );
    assert.deepEqual(facts, ["Pipeline", "Created"]);
    assert.equal(findByClass(view.element, "job-details__hint").length, 0);
    assert.equal(findByClass(view.element, "job-details__section-title").length, 0);
    assert.equal(findByClass(view.element, "job-details__aoi-list").length, 0);
    assert.equal(findByClass(view.element, "job-status-button").length, 2);
    assert.ok(!elementText(view.element).includes('["package","enc","east"]'));

    view.showJobListFromDetails();
    assert.equal(findByClass(view.element, "job-card").length, 1);
    view.destroy();
  });
});

test("Packages header Refresh is icon-only and remains mounted across detail navigation", () => {
  withDocument(() => {
    for (const source of ["live", "mock"]) {
      const { store, job } = fixture(source);
      const overlay = createJobsOverlay({ jobStore: store, sourceMode: source });
      const original = assertRefreshIconButton(overlay.element);
      overlay.showJobDetails({ jobId: job.id });
      assert.equal(assertRefreshIconButton(overlay.element), original);
      assert.equal(findByClass(overlay.element, "job-list__refresh-button").length, 1);
      overlay.destroy();
    }
  });
});

test("Busy Packages header Refresh remains disabled with an accessible label", () => {
  withDocument(() => {
    const { store } = fixture("live");
    const getSnapshot = store.getSnapshot;
    store.getSnapshot = () => ({ ...getSnapshot(), isLoading: true });
    store.subscribe = (listener) => {
      listener(store.getSnapshot());
      return () => {};
    };
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    assertRefreshIconButton(overlay.element, { disabled: true });
    overlay.destroy();
  });
});

test("Missing Package details have Back and retained header Refresh recovery", () => {
  withDocument(() => {
    const { store } = fixture("live");
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    void overlay.showJobDetails({ jobId: "missing-job" });
    assert.equal(findByClass(overlay.element, "job-list__state--error").length, 1);
    assertRefreshIconButton(overlay.element);
    overlay.destroy();
  });
});

test("Mock Jobs retain expansion, AOI details and existing map actions", () => {
  withDocument(() => {
    const { store } = fixture("mock");
    const view = createJobList({ store, sourceMode: "mock" });
    assert.equal(findByClass(view.element, "job-card__expand-action").length, 1);
    assert.equal(
      findByTag(view.element, "calcite-button").filter((e) => e.textContent === "Expand all")
        .length,
      1
    );
    const detailsAction = findByClass(view.element, "job-card__details-action")[0];
    detailsAction.dispatchEvent({ type: "click" });
    assert.equal(findByClass(view.element, "job-details__title")[0].textContent, "Mock survey");
    assert.equal(
      findByTag(view.element, "calcite-button").filter((e) => e.textContent === "Focus map").length,
      1
    );
    assert.equal(findByClass(view.element, "job-details__aoi-item").length, 1);
    assert.ok(
      findByClass(view.element, "job-details__fact-label").some(
        (e) => e.textContent === "Package ID"
      )
    );
    view.destroy();
  });
});

test("Optional live metadata cannot create placeholder dates or fabricated Package titles", () => {
  withDocument(() => {
    const { store, job } = fixture("live");
    job.shortId = null;
    job.packageTitle = null;
    job.createdAt = null;
    const view = createJobList({ store, sourceMode: "live" });
    assert.equal(findByClass(view.element, "job-card__title")[0].textContent, "package");
    findByClass(view.element, "job-card__details-action")[0].dispatchEvent({ type: "click" });
    assert.equal(findByClass(view.element, "job-details__title")[0].textContent, "package");
    assert.equal(findByClass(view.element, "job-details__package-title").length, 0);
    assert.deepEqual(
      findByClass(view.element, "job-details__fact-label").map((item) => item.textContent),
      ["Pipeline"]
    );
    view.destroy();
  });
});

test("Initial Jobs error provides an accessible Retry that invokes one new read", () => {
  withDocument(() => {
    let reads = 0;
    const errorState = {
      jobs: [],
      isLoading: false,
      error: { message: "Workspace catalogue unavailable" },
    };
    const store = {
      getSnapshot: () => errorState,
      subscribe(listener) {
        listener(errorState);
        return () => {};
      },
      loadJobs() {
        reads++;
        return Promise.resolve({ ok: false, error: errorState.error });
      },
    };
    const view = createJobList({ store, sourceMode: "live" });
    const error = findByClass(view.element, "job-list__state--error")[0];
    assert.match(elementText(error), /Workspace catalogue unavailable/);
    const retry = findByTag(error, "calcite-button")[0];
    assert.equal(retry.textContent, "Retry");
    assert.equal(retry.disabled, false);
    retry.dispatchEvent({ type: "click" });
    assert.equal(reads, 1);
    view.destroy();
  });
});

test("Job Details error also provides an in-panel Retry", () => {
  withDocument(() => {
    const job = fixture("live").job;
    let publish;
    let snapshot = { jobs: [job], isLoading: false, error: null };
    const store = {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        publish = listener;
        listener(snapshot);
        return () => {};
      },
      loadJobs() {
        return Promise.resolve({ ok: false, error: snapshot.error });
      },
    };
    const view = createJobList({ store, sourceMode: "live" });
    findByClass(view.element, "job-card__details-action")[0].dispatchEvent({ type: "click" });
    snapshot = { jobs: [], isLoading: false, error: { message: "Membership denied" } };
    publish(snapshot);
    const retry = findByTag(
      findByClass(view.element, "job-list__state--error")[0],
      "calcite-button"
    )[0];
    assert.equal(retry.textContent, "Retry");
    view.destroy();
  });
});

async function withAsyncDocument(run) {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  globalThis.document = { createElement: (name) => new TestElement(name) };
  globalThis.window = {
    requestAnimationFrame: (callback) => callback(),
    setTimeout: () => 0,
  };
  try {
    await run();
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  }
}

for (const sourceMode of ["live", "mock"]) {
  test(`Retry from an initial ${sourceMode} Jobs failure recovers without a panel reopen`, async () => {
    await withAsyncDocument(async () => {
      let reads = 0;
      let resolveRetry;
      const retryResult = new Promise((resolve) => {
        resolveRetry = resolve;
      });
      const store = createJobStore({
        service: {
          loadJobs() {
            reads++;
            return reads === 1
              ? Promise.resolve({ ok: false, error: { message: "Temporary Jobs failure" } })
              : retryResult;
          },
        },
      });
      try {
        await store.loadJobs();
        const view = createJobList({ store, sourceMode });
        try {
          const error = findByClass(view.element, "job-list__state--error")[0];
          assert.match(elementText(error), /Temporary Jobs failure/);
          const retry = findByTag(error, "calcite-button")[0];
          retry.dispatchEvent({ type: "click" });
          assert.equal(reads, 2);
          assert.equal(store.getSnapshot().isLoading, true);
          assert.equal(findByClass(view.element, "job-list__state--loading").length, 1);

          resolveRetry({ ok: true, data: { jobs: [fixture(sourceMode).job] } });
          await new Promise((resolve) => setImmediate(resolve));
          assert.equal(findByClass(view.element, "job-card").length, 1);
          assert.equal(findByClass(view.element, "job-list__state--error").length, 0);
          assert.equal(store.getSnapshot().error, null);
        } finally {
          view.destroy();
        }
      } finally {
        store.destroy();
      }
    });
  });
}

test("keyboard status focus survives a store emission replacing the live Job card", () => {
  withDocument(() => {
    const { job } = fixture("live");
    let publish;
    const store = {
      getSnapshot: () => ({ jobs: [job], isLoading: false, error: null }),
      subscribe(listener) {
        publish = listener;
        listener(this.getSnapshot());
        return () => {};
      },
    };
    const view = createJobList({ store, sourceMode: "live" });
    const first = findByClass(view.element, "job-status-button").find(
      (button) => button.dataset.jobFocus === "status:done"
    );
    first.focus();
    view.element.dispatchEvent({ type: "keydown" });
    publish({ jobs: [{ ...job, status: "todo" }], isLoading: false, error: null });
    assert.notEqual(globalThis.document.activeElement, first);
    assert.equal(globalThis.document.activeElement.dataset.jobFocus, "status:done");
    assert.equal(globalThis.document.activeElement.disabled, false);
    view.destroy();
  });
});

test("Keyboard focus stays on the retained header Refresh across list rerenders", () => {
  withDocument(() => {
    const { job } = fixture("live");
    let publish;
    const store = {
      getSnapshot: () => ({ jobs: [job], isLoading: false, error: null }),
      subscribe(listener) {
        publish = listener;
        listener(this.getSnapshot());
        return () => {};
      },
    };
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    const refresh = assertRefreshIconButton(overlay.element);
    refresh.focus();
    publish({ jobs: [job], isLoading: true, error: null });
    assert.equal(globalThis.document.activeElement, refresh);
    assert.equal(refresh.disabled, true);
    publish({ jobs: [job], isLoading: false, error: null });
    assert.equal(globalThis.document.activeElement, refresh);
    assert.equal(refresh.disabled, false);
    overlay.destroy();
  });
});

test("Disappearing focused Package falls back to the stable list container", () => {
  withDocument(() => {
    const { job } = fixture("mock");
    let publish;
    const store = {
      getSnapshot: () => ({ jobs: [job], isLoading: false, error: null }),
      subscribe(listener) {
        publish = listener;
        listener(this.getSnapshot());
        return () => {};
      },
    };
    const view = createJobList({ store, sourceMode: "mock" });
    findByClass(view.element, "job-status-button")[0].focus();
    view.element.dispatchEvent({ type: "keydown" });
    publish({ jobs: [], isLoading: false, error: null });
    assert.equal(globalThis.document.activeElement, view.element);
    view.destroy();
  });
});

test("Done and No update can each be set and toggled off without hiding the current card", async () => {
  await withAsyncDocument(async () => {
    const job = fixture("live").job;
    const mutations = [];
    const store = createJobStore({
      service: {
        loadJobs: async () => ({ ok: true, data: { jobs: [job] } }),
        updateJobStatus: async (id, status) => {
          mutations.push([id, status]);
          return { ok: true, data: { job: { ...job, id, status }, createdJobs: [] } };
        },
      },
    });
    await store.loadJobs();
    const view = createJobList({ store, sourceMode: "live" });
    try {
      for (const [action, expectedStatus] of [
        ["status:done", "done"],
        ["status:noUpdate", "noUpdate"],
        ["status:noUpdate", "todo"],
        ["status:noUpdate", "noUpdate"],
        ["status:done", "done"],
        ["status:done", "todo"],
      ]) {
        const button = findByClass(view.element, "job-status-button").find(
          (item) => item.dataset.jobFocus === action
        );
        button.dispatchEvent({ type: "click" });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(store.getSnapshot().jobs[0].status, expectedStatus);
        assert.equal(findByClass(view.element, "job-card").length, 1);
        assert.equal(
          findByClass(view.element, "job-status-button").filter(
            (item) => item.attributes.get("aria-pressed") === "true"
          ).length,
          expectedStatus === "todo" ? 0 : 1
        );
      }
      assert.deepEqual(
        mutations.map((item) => item[1]),
        ["done", "noUpdate", "todo", "noUpdate", "done", "todo"]
      );
    } finally {
      view.destroy();
      store.destroy();
    }
  });
});
