import assert from "node:assert/strict";
import test from "node:test";
import { createJobList } from "./jobList.js";
import { createPackageHistoryList } from "./createPackageHistory.js";
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

function assertRefreshIconButton(root, { disabled = false, hidden = false } = {}) {
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
  assert.equal(buttons[0].hidden, hidden);
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
    assert.equal(card.classList.contains("job-card--live"), true);
    const statusGroup = findByClass(card, "job-card__actions")[0];
    assert.equal(statusGroup.attributes.get("role"), "group");
    assert.equal(statusGroup.attributes.get("aria-label"), "Update Package status");
    assert.deepEqual(
      findByTag(statusGroup, "calcite-button").map((button) => button.textContent),
      ["Done", "No update"]
    );
    assert.equal(findByClass(view.element, "job-card__expand-action").length, 0);
    assert.equal(findByClass(view.element, "job-card__details-action").length, 1);
    assert.equal(findByClass(view.element, "job-card__title")[0].textContent, "NM1000");
    assert.equal(
      findByClass(view.element, "job-card__context")[0].textContent,
      "ENC / Eastern Denmark"
    );
    assert.equal(findByClass(view.element, "job-card__date-chip").length, 0);
    assert.equal(findByClass(view.element, "job-card__actions").length, 1);
    assert.equal(findByClass(view.element, "job-list__count")[0].textContent, "1 Packages");
    assert.equal(
      findByTag(view.element, "calcite-button").filter((e) => e.textContent === "Expand all")
        .length,
      0
    );
    const assignmentLinks = findByClass(card, "job-card__assignment-link");
    assert.equal(assignmentLinks.length, 1);
    assert.equal(assignmentLinks[0].tagName, "a");
    assert.equal(assignmentLinks[0].href, "/assignments/packages/package");
    assert.equal(assignmentLinks[0].target, "_blank");
    assert.equal(assignmentLinks[0].rel, "noopener noreferrer");
    assert.equal(
      assignmentLinks[0].attributes.get("aria-label"),
      "Open Package assignment for NM1000 in new tab"
    );
    assert.equal(findByTag(assignmentLinks[0], "calcite-icon")[0].icon, "launch");
    assert.equal(card.dataset.jobId, '["package","enc","east"]');
    view.destroy();
  });
});

test("Package shortcut keeps the base path and excludes missing or invalid identities", () => {
  const originalLocation = globalThis.location;
  globalThis.location = { pathname: "/catalogue/" };
  try {
    withDocument(() => {
      const { store, job } = fixture("live");
      job.packageId = "opaque/id?x=1";
      const view = createJobList({ store, sourceMode: "live" });
      const link = findByClass(view.element, "job-card__assignment-link")[0];
      assert.equal(link.href, "/catalogue/assignments/packages/opaque%2Fid%3Fx%3D1");
      view.destroy();

      job.packageId = "";
      const noIdView = createJobList({ store, sourceMode: "live" });
      assert.equal(findByClass(noIdView.element, "job-card__assignment-link").length, 0);
      noIdView.destroy();

      job.packageId = "\uD800";
      const invalidView = createJobList({ store, sourceMode: "live" });
      assert.equal(findByClass(invalidView.element, "job-card__assignment-link").length, 0);
      invalidView.destroy();
    });
  } finally {
    if (originalLocation === undefined) delete globalThis.location;
    else globalThis.location = originalLocation;
  }
});

test("Different contextual Jobs link to the same canonical Package assignment", () => {
  withDocument(() => {
    const { job } = fixture("live");
    const sibling = {
      ...job,
      id: '["package","paper","west"]',
      pipelineName: "Paper Charts",
      workspaceName: "Western Denmark",
    };
    const snapshot = { jobs: [job, sibling], isLoading: false, error: null };
    const store = {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listener(snapshot);
        return () => {};
      },
    };
    const view = createJobList({ store, sourceMode: "live" });
    assert.deepEqual(
      findByClass(view.element, "job-card__assignment-link").map((link) => link.href),
      ["/assignments/packages/package", "/assignments/packages/package"]
    );
    const groups = findByClass(view.element, "job-list__package-group");
    assert.equal(groups.length, 1);
    assert.equal(findByClass(view.element, "job-list__count")[0].textContent, "1 Packages");
    assert.equal(groups[0].open, true);
    assert.equal(findByClass(groups[0], "job-list__package-title")[0].textContent, "NM1000");
    assert.equal(findByClass(groups[0], "job-list__package-meta")[0].textContent, "2 workstreams");
    assert.deepEqual(
      findByClass(groups[0], "job-card__title").map((node) => node.textContent),
      ["ENC / Eastern Denmark", "Paper Charts / Western Denmark"]
    );
    assert.equal(findByClass(groups[0], "job-card__actions").length, 2);
    assert.equal(findByClass(groups[0], "job-card__context").length, 0);
    view.destroy();
  });
});

test("a Package in two Workspaces of one Pipeline has concise Workspace metadata", () => {
  withDocument(() => {
    const { job } = fixture("live");
    const sibling = {
      ...job,
      id: '["package","enc","west"]',
      pipelineId: "enc",
      workspaceId: "west",
      workspaceName: "Western Denmark",
      status: "todo",
    };
    const snapshot = {
      jobs: [{ ...job, pipelineId: "enc", workspaceId: "east" }, sibling],
      isLoading: false,
      error: null,
    };
    const store = {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listener(snapshot);
        return () => {};
      },
    };
    const view = createJobList({ store, sourceMode: "live" });
    try {
      const groups = findByClass(view.element, "job-list__package-group");
      assert.equal(groups.length, 1);
      assert.equal(findByClass(groups[0], "job-list__package-meta")[0].textContent, "2 workspaces");
      assert.equal(
        findByClass(groups[0], "job-card").length,
        2,
        "both contextual Jobs remain independently actionable"
      );
    } finally {
      view.destroy();
    }
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
    assert.equal(details.classList.contains("job-details--live"), true);
    assert.equal(findByClass(view.element, "job-details__header--live").length, 1);
    assert.equal(findByClass(view.element, "job-details__header-actions").length, 0);
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
    assert.deepEqual(facts, ["Workstream", "Created"]);
    assert.equal(findByClass(view.element, "job-details__hint").length, 0);
    assert.deepEqual(
      findByClass(view.element, "job-details__section-title").map((item) => item.textContent),
      ["History"]
    );
    assert.equal(findByClass(view.element, "job-details__aoi-list").length, 0);
    assert.equal(findByClass(view.element, "job-status-button").length, 2);
    assert.ok(!elementText(view.element).includes('["package","enc","east"]'));

    view.showJobListFromDetails();
    assert.equal(findByClass(view.element, "job-card").length, 1);
    view.destroy();
  });
});

test("Packages header Refresh is list-only and retains its identity after Back", () => {
  withDocument(() => {
    for (const source of ["live", "mock"]) {
      const { store, job } = fixture(source);
      const overlay = createJobsOverlay({ jobStore: store, sourceMode: source });
      const original = assertRefreshIconButton(overlay.element);
      original.focus();
      void overlay.showJobDetails({ jobId: job.id });
      assert.equal(assertRefreshIconButton(overlay.element, { hidden: true }), original);
      assert.notEqual(globalThis.document.activeElement, original);
      findByClass(overlay.element, "data-catalogue-overlay-panel__back")[0].dispatchEvent({
        type: "click",
      });
      assert.equal(assertRefreshIconButton(overlay.element), original);
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

test("Missing Package details retain Back and error-only Retry without header Refresh", () => {
  withDocument(() => {
    const { store } = fixture("live");
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    void overlay.showJobDetails({ jobId: "missing-job" });
    assert.equal(findByClass(overlay.element, "job-list__state--error").length, 1);
    assertRefreshIconButton(overlay.element, { hidden: true });
    const back = findByClass(overlay.element, "data-catalogue-overlay-panel__back")[0];
    assert.equal(back.hidden, false);
    const retry = findByClass(
      overlay.packageInformationElement,
      "dc-package-information-panel__retry"
    )[0];
    assert.equal(retry.hidden, false);
    back.dispatchEvent({ type: "click" });
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
    assert.equal(findByClass(view.element, "job-card__assignment-link").length, 0);
    assert.equal(findByClass(view.element, "job-details--live").length, 0);
    assert.equal(findByClass(view.element, "job-details__header--live").length, 0);
    assert.equal(findByClass(view.element, "job-details__header-actions").length, 1);
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
      ["Workstream"]
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

test("live Packages panel reuses a recent list but Refresh and expiry fetch fresh data", async () => {
  await withAsyncDocument(async () => {
    let reads = 0;
    const store = createJobStore({
      service: {
        async loadJobs() {
          reads++;
          return { ok: true, data: { jobs: [] } };
        },
      },
    });
    await store.loadJobs();
    let now = store.getSnapshot().lastSuccessfulLoadAt;
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live", now: () => now });
    try {
      assert.equal((await overlay.refreshJobs({ onPanelOpen: true })).reused, true);
      assert.equal(reads, 1);
      now += 59_999;
      assert.equal((await overlay.refreshJobs({ onPanelOpen: true })).reused, true);
      assert.equal(reads, 1);
      now += 1;
      assert.equal((await overlay.refreshJobs({ onPanelOpen: true })).ok, true);
      assert.equal(reads, 2);

      const refresh = assertRefreshIconButton(overlay.element);
      refresh.dispatchEvent({ type: "click" });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(reads, 3, "Manual Refresh must bypass panel reuse");
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("live Packages panel does not restart an in-flight read, but retries after failure", async () => {
  await withAsyncDocument(async () => {
    let calls = 0;
    let finishInitial;
    const store = createJobStore({
      service: {
        loadJobs() {
          calls++;
          if (calls === 1) {
            return new Promise((resolve) => {
              finishInitial = resolve;
            });
          }
          if (calls === 2) return Promise.resolve({ ok: false, error: new Error("Offline") });
          return Promise.resolve({ ok: true, data: { jobs: [] } });
        },
      },
    });
    const pending = store.loadJobs();
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    try {
      assert.deepEqual(await overlay.refreshJobs({ onPanelOpen: true }), {
        ok: false,
        pending: true,
      });
      assert.equal(calls, 1);
      finishInitial({ ok: true, data: { jobs: [] } });
      await pending;
      assert.equal((await overlay.refreshJobs({ onPanelOpen: true })).reused, true);

      await store.loadJobs();
      assert.equal((await overlay.refreshJobs({ onPanelOpen: true })).ok, true);
      assert.equal(calls, 3, "A failed read must never be reused as successful data");
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("mock Packages panel still reloads on every open", async () => {
  await withAsyncDocument(async () => {
    let calls = 0;
    const store = createJobStore({
      service: {
        async loadJobs() {
          calls++;
          return { ok: true, data: { jobs: [] } };
        },
      },
    });
    await store.loadJobs();
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "mock" });
    try {
      await overlay.refreshJobs({ onPanelOpen: true });
      await overlay.refreshJobs({ onPanelOpen: true });
      assert.equal(calls, 3);
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("Main Map Package list filters a Pipeline and optional Workspace without merging Job statuses", () => {
  withDocument(() => {
    const { job } = fixture("live");
    const jobs = [
      { ...job, id: "enc:east", pipelineId: "enc", workspaceId: "east" },
      { ...job, id: "enc:west", pipelineId: "enc", workspaceId: "west", status: "done" },
      { ...job, id: "paper:north", pipelineId: "paper", workspaceId: "north" },
    ];
    const snapshot = { jobs, isLoading: false, error: null };
    const store = {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listener(snapshot);
        return () => {};
      },
    };
    const list = createJobList({ store, sourceMode: "live" });
    list.setPackageScope({ pipelineId: "enc", workspaceId: null });
    assert.deepEqual(
      findByClass(list.element, "job-card").map((card) => card.dataset.jobId),
      ["enc:east"]
    );
    list.setPackageScope({ pipelineId: "paper", workspaceId: "north" });
    assert.deepEqual(
      findByClass(list.element, "job-card").map((card) => card.dataset.jobId),
      ["paper:north"]
    );
    list.setPackageScope({ pipelineId: "enc", workspaceId: "west" });
    // The completed Workspace has its own Job identity and remains hidden by the default status filter.
    assert.equal(findByClass(list.element, "job-card").length, 0);
    list.destroy();
  });
});

function readInformationFields(panel) {
  const fields = findByClass(panel, "dc-information-fields")[0];
  if (!fields) return [];
  return fields.children
    .filter((node) => node.tagName === "dt")
    .map((term, index) => [term.textContent, fields.children[index * 2 + 1].textContent]);
}

function informationToggle(overlay) {
  return findByClass(overlay.element, "data-catalogue-overlay-panel__information")[0];
}

function informationClose(panel) {
  return findByTag(panel, "calcite-action").find((button) => button.icon === "x");
}

function informationStatus(panel) {
  return findByClass(panel, "dc-package-information-panel__status")[0].textContent;
}

test("Entering live Details opens the shared Package metadata without a new read", async () => {
  await withAsyncDocument(async () => {
    const job = {
      ...fixture("live").job,
      category: "NM",
      details: "Full description from the normalized Package",
      nauticalCharts: "123 / 456",
      publication: "Source publication",
    };
    let reads = 0;
    const store = createJobStore({
      service: {
        async loadJobs() {
          reads++;
          return { ok: true, data: { jobs: [job] } };
        },
      },
    });
    await store.loadJobs();
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    const panel = overlay.packageInformationElement;
    try {
      assert.equal(panel.hidden, true);
      assert.equal(informationToggle(overlay).hidden, true);
      findByClass(overlay.element, "job-card__details-action")[0].dispatchEvent({ type: "click" });
      assert.equal(panel.hidden, false);
      assert.equal(panel.inert, false);
      assert.equal(informationToggle(overlay).attributes.get("aria-controls"), panel.id);
      assert.equal(informationToggle(overlay).attributes.get("aria-expanded"), "true");
      assert.deepEqual(readInformationFields(panel), [
        ["Title", "Harbour notice"],
        ["Category", "NM"],
        ["Severity", "Severity 9007199254740993"],
        ["Details", "Full description from the normalized Package"],
        ["Nautical charts", "123 / 456"],
        ["Publication", "Source publication"],
      ]);
      assert.equal(findByClass(panel, "dc-information-panel__name")[0].textContent, "NM1000");
      assert.equal(findByClass(overlay.element, "job-status-button").length, 2);
      const refresh = assertRefreshIconButton(overlay.element, { hidden: true });
      refresh.dispatchEvent({ type: "click" });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(reads, 1, "The hidden list action cannot start a Details refresh");
      await overlay.showJobDetails({ jobId: job.id });
      assert.equal(reads, 1, "Reopening Details must reuse the current store snapshot");
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("Closing information leaves contextual Details open and a status update does not reopen it", async () => {
  await withAsyncDocument(async () => {
    const job = fixture("live").job;
    const store = createJobStore({
      service: {
        loadJobs: async () => ({ ok: true, data: { jobs: [job] } }),
        updateJobStatus: async (id, status) => ({
          ok: true,
          data: { job: { ...job, id, status }, createdJobs: [] },
        }),
      },
    });
    await store.loadJobs();
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    const panel = overlay.packageInformationElement;
    try {
      await overlay.showJobDetails({ jobId: job.id });
      const fields = findByClass(panel, "dc-information-fields")[0];
      const close = informationClose(panel);
      close.focus();
      close.dispatchEvent({ type: "click" });
      assert.equal(panel.hidden, true);
      assert.equal(panel.inert, true);
      assert.equal(globalThis.document.activeElement, informationToggle(overlay));
      assert.equal(findByClass(overlay.element, "job-details").length, 1);
      await store.updateJobStatus(job.id, "done");
      assertRefreshIconButton(overlay.element, { hidden: true });
      assert.equal(panel.hidden, true);
      assert.equal(findByClass(panel, "dc-information-fields")[0], fields);
      informationToggle(overlay).dispatchEvent({ type: "click" });
      assert.equal(panel.hidden, false);
      assert.equal(findByClass(panel, "dc-information-fields")[0], fields);
      close.focus();
      let prevented = false;
      panel.dispatchEvent({
        type: "keydown",
        key: "Escape",
        preventDefault: () => (prevented = true),
        stopPropagation() {},
      });
      assert.equal(prevented, true);
      assert.equal(panel.hidden, true);
      await overlay.showJobDetails({ jobId: job.id });
      assert.equal(panel.hidden, false, "An explicit Details intent reopens information");
      findByClass(overlay.element, "data-catalogue-overlay-panel__back")[0].dispatchEvent({
        type: "click",
      });
      assert.equal(panel.hidden, true);
      assert.deepEqual(readInformationFields(panel), []);
      assert.equal(informationToggle(overlay).hidden, true);
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("A pending refresh cannot display another Package under the latest Details selection", async () => {
  await withAsyncDocument(async () => {
    const a = { ...fixture("live").job, details: "Description A" };
    const b = {
      ...a,
      id: '["package-b","enc","east"]',
      packageId: "package-b",
      shortId: "NM2000",
      packageTitle: "Package B",
      details: "Description B",
    };
    let reads = 0;
    let finishOld;
    let finishRetry;
    const store = createJobStore({
      service: {
        loadJobs() {
          reads++;
          if (reads === 1) return Promise.resolve({ ok: true, data: { jobs: [a, b] } });
          if (reads === 2) {
            return new Promise((resolve) => {
              finishOld = resolve;
            });
          }
          if (reads === 3) return Promise.resolve({ ok: true, data: { jobs: [a] } });
          return new Promise((resolve) => {
            finishRetry = resolve;
          });
        },
      },
    });
    await store.loadJobs();
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    const panel = overlay.packageInformationElement;
    try {
      await overlay.showJobDetails({ jobId: a.id });
      const pending = store.loadJobs();
      assert.match(informationStatus(panel), /Refreshing/);
      await overlay.showJobDetails({ jobId: b.id });
      assert.ok(elementText(panel).includes("Description B"));
      assert.ok(!elementText(panel).includes("Description A"));
      await store.loadJobs();
      assert.deepEqual(readInformationFields(panel), []);
      assert.match(informationStatus(panel), /unavailable/);
      finishOld({ ok: true, data: { jobs: [a, { ...b, details: "Stale description" }] } });
      assert.equal((await pending).stale, true);
      assert.ok(!elementText(panel).includes("Stale description"));
      const retry = findByClass(panel, "dc-package-information-panel__retry")[0];
      retry.dispatchEvent({ type: "click" });
      retry.dispatchEvent({ type: "click" });
      assert.equal(reads, 4, "One pending Retry must own the new read");
      assert.match(informationStatus(panel), /Loading/);
      finishRetry({ ok: true, data: { jobs: [b] } });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(informationStatus(panel), "");
      assert.ok(elementText(panel).includes("Description B"));
      assert.equal(retry.hidden, true);
      overlay.clearSelectedJob();
      assert.equal(panel.hidden, true);
      assert.deepEqual(readInformationFields(panel), []);
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("A failed refresh retains only the selected Package metadata and offers shared Retry", async () => {
  await withAsyncDocument(async () => {
    const job = { ...fixture("live").job, details: "Last successful description" };
    let reads = 0;
    const store = createJobStore({
      service: {
        async loadJobs() {
          reads++;
          if (reads === 2) return { ok: false, error: new Error("Offline") };
          return { ok: true, data: { jobs: [job] } };
        },
      },
    });
    await store.loadJobs();
    const overlay = createJobsOverlay({ jobStore: store, sourceMode: "live" });
    const panel = overlay.packageInformationElement;
    try {
      await overlay.showJobDetails({ jobId: job.id });
      await store.loadJobs();
      assert.match(informationStatus(panel), /Refresh failed/);
      assert.ok(elementText(panel).includes("Last successful description"));
      const retry = findByClass(panel, "dc-package-information-panel__retry")[0];
      assert.equal(retry.hidden, false);
      retry.dispatchEvent({ type: "click" });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(reads, 3);
      assert.equal(informationStatus(panel), "");
      assert.equal(retry.hidden, true);
      await overlay.showJobDetails({ jobId: "not-loaded" });
      assert.deepEqual(readInformationFields(panel), []);
      assert.ok(!elementText(panel).includes("Last successful description"));
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("Mock Details does not mount a live Package information panel", () => {
  withDocument(() => {
    const { store, job } = fixture("mock");
    const overlay = createJobsOverlay({ jobStore: store });
    void overlay.showJobDetails({ jobId: job.id });
    assert.equal(overlay.packageInformationElement, null);
    assert.equal(informationToggle(overlay), undefined);
    overlay.destroy();
  });
});

const recordedHistoryEvent = (id, overrides = {}) => ({
  id,
  eventType: "packageCreated",
  occurredAtUtc: "2026-01-15T14:35:00Z",
  actor: null,
  pipelineId: null,
  pipelineName: null,
  severity: null,
  ...overrides,
});

const recordedHistoryPage = (id = "event-a") => ({
  items: [recordedHistoryEvent(id)],
  nextBefore: null,
});

test("Live History reads only the canonical Package after opening Details", async () => {
  await withAsyncDocument(async () => {
    const { store, job } = fixture("live");
    const calls = [];
    let resolveRead;
    const overlay = createJobsOverlay({
      jobStore: store,
      sourceMode: "live",
      readPackageHistory(id, options) {
        calls.push({ id, options });
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
    });
    try {
      assert.equal(calls.length, 0);
      assert.equal(findByClass(overlay.element, "package-history").length, 0);
      await overlay.showJobDetails({ jobId: job.id });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].id, job.packageId);
      assert.equal(calls[0].options.before, null);
      const details = findByClass(overlay.element, "job-details")[0];
      const history = findByClass(details, "package-history")[0];
      assert.equal(details.children.at(-1), history);
      assert.ok(details.children[0].classList.contains("job-details__section--live-status"));
      assert.ok(details.children[1].classList.contains("job-details__section--live-facts"));
      assert.match(elementText(history), /Loading Package history/);
      resolveRead({
        items: [
          recordedHistoryEvent("bind", {
            eventType: "pipelineAssigned",
            pipelineId: "enc",
            pipelineName: "ENC",
          }),
          recordedHistoryEvent("created", { occurredAtUtc: "2026-01-14T10:00:00Z" }),
        ],
        nextBefore: null,
      });
      await Promise.resolve();
      // History-only completion must not replace Details or reopen the metadata panel.
      assert.equal(findByClass(overlay.element, "job-details")[0], details);
      const scroll = findByClass(history, "package-history__scroll")[0];
      assert.equal(scroll.hidden, false);
      assert.equal(scroll.tabIndex, 0);
      assert.equal(scroll.attributes.get("role"), "region");
      assert.equal(scroll.attributes.get("aria-label"), "Package history, newest first");
      assert.equal(findByTag(history, "li").length, 2);
      assert.match(elementText(history), /Workstream assigned/);
      assert.match(elementText(history), /Workstream: ENC/);
      assert.match(elementText(history), /Actor not recorded/);
      assert.doesNotMatch(elementText(history), /Design preview|fictional|Example user/);
      assert.equal(findByClass(overlay.packageInformationElement, "package-history").length, 0);
      overlay.clearSelectedJob();
      assert.equal(findByClass(overlay.element, "package-history").length, 0);
    } finally {
      overlay.destroy();
    }
  });
});

test("History scroll and keyboard focus survive a same-context store emission only", async () => {
  await withAsyncDocument(async () => {
    const { job } = fixture("live");
    const otherContext = { ...job, id: '["package","enc","west"]', workspaceName: "West" };
    let publish;
    let reads = 0;
    const store = {
      getSnapshot: () => ({ jobs: [job, otherContext], isLoading: false, error: null }),
      subscribe(listener) {
        publish = listener;
        listener(this.getSnapshot());
        return () => {};
      },
    };
    const view = createJobList({
      store,
      sourceMode: "live",
      async readPackageHistory() {
        reads++;
        return recordedHistoryPage();
      },
    });
    try {
      await view.showJobDetails({ jobId: job.id });
      const first = findByClass(view.element, "package-history__scroll")[0];
      assert.equal(first.hidden, false);
      first.scrollTop = 80;
      first.focus();
      view.element.dispatchEvent({ type: "keydown" });
      publish({ jobs: [{ ...job, status: "done" }, otherContext], isLoading: false, error: null });
      const next = findByClass(view.element, "package-history__scroll")[0];
      assert.notEqual(next, first);
      assert.equal(next.scrollTop, 80);
      assert.equal(globalThis.document.activeElement, next);
      assert.equal(next.dataset.jobFocus, "history");
      await view.showJobDetails({ jobId: otherContext.id });
      assert.equal(reads, 1, "Same canonical Package must reuse the current history");
      assert.equal(findByClass(view.element, "package-history__scroll")[0].scrollTop, 0);
      assert.equal(globalThis.document.activeElement.dataset.jobDetailsId, otherContext.id);
      publish({ jobs: [job], isLoading: false, error: null });
      assert.equal(findByClass(view.element, "package-history").length, 0);
      assert.match(elementText(view.element), /Selected Package is unavailable/);
      await view.showJobDetails({ jobId: job.id });
      assert.equal(reads, 2);
      assert.equal(findByClass(view.element, "package-history__scroll")[0].scrollTop, 0);
      view.showJobListFromDetails();
      assert.equal(findByClass(view.element, "package-history").length, 0);
    } finally {
      view.destroy();
    }
    assert.equal(view.element.children.length, 0);
  });
});

test("Temporary status mutations add no history reads or status-derived events", async () => {
  await withAsyncDocument(async () => {
    const job = fixture("live").job;
    let reads = 0;
    let historyReads = 0;
    let writes = 0;
    const store = createJobStore({
      service: {
        async loadJobs() {
          reads++;
          return { ok: true, data: { jobs: [job] } };
        },
        async updateJobStatus(id, status) {
          writes++;
          return { ok: true, data: { job: { ...job, id, status }, createdJobs: [] } };
        },
      },
    });
    await store.loadJobs();
    const overlay = createJobsOverlay({
      jobStore: store,
      sourceMode: "live",
      async readPackageHistory() {
        historyReads++;
        return recordedHistoryPage();
      },
    });
    try {
      await overlay.showJobDetails({ jobId: job.id });
      const historyText = elementText(findByClass(overlay.element, "package-history")[0]);
      assert.equal(reads, 1);
      assert.equal(historyReads, 1);
      assert.equal(writes, 0);
      await store.updateJobStatus(job.id, "done");
      assert.equal(elementText(findByClass(overlay.element, "package-history")[0]), historyText);
      await overlay.showJobDetails({ jobId: job.id });
      assert.equal(reads, 1);
      assert.equal(historyReads, 1);
      assert.equal(writes, 1);
      assert.equal(overlay.packageInformationElement.hidden, false);
    } finally {
      overlay.destroy();
      store.destroy();
    }
  });
});

test("History failure, retry and older-page controls do not replace the Details view", async () => {
  await withAsyncDocument(async () => {
    const { job, store } = fixture("live");
    const calls = [];
    const view = createJobList({
      store,
      sourceMode: "live",
      async readPackageHistory(id, { before }) {
        calls.push([id, before]);
        if (calls.length === 1) throw new Error("Access denied.");
        if (before)
          return {
            items: [recordedHistoryEvent("older", { occurredAtUtc: "2026-01-14T10:00:00Z" })],
            nextBefore: null,
          };
        return { items: [recordedHistoryEvent("first")], nextBefore: "first" };
      },
    });
    try {
      await view.showJobDetails({ jobId: job.id });
      const history = findByClass(view.element, "package-history")[0];
      const scroll = findByClass(history, "package-history__scroll")[0];
      const action = findByClass(history, "package-history__more")[0];
      assert.match(elementText(history), /Access denied/);
      assert.equal(scroll.hidden, true);
      assert.equal(action.textContent, "Retry");
      action.dispatchEvent({ type: "click" });
      action.dispatchEvent({ type: "click" });
      await Promise.resolve();
      assert.equal(calls.length, 2);
      assert.equal(scroll.hidden, false);
      assert.equal(action.textContent, "Load older events");
      scroll.scrollTop = 30;
      action.focus();
      action.dispatchEvent({ type: "click" });
      await Promise.resolve();
      assert.deepEqual(calls, [
        [job.packageId, null],
        [job.packageId, null],
        [job.packageId, "first"],
      ]);
      assert.equal(findByClass(view.element, "package-history")[0], history);
      assert.equal(findByTag(scroll, "li").length, 2);
      assert.equal(scroll.scrollTop, 30);
      assert.equal(action.hidden, true);
      assert.equal(globalThis.document.activeElement, scroll);
    } finally {
      view.destroy();
    }
  });
});

test("History is absent for mock Details and missing live selections", () => {
  withDocument(() => {
    const mock = fixture("mock");
    const mockView = createJobList({ store: mock.store });
    void mockView.showJobDetails({ jobId: mock.job.id });
    assert.equal(findByClass(mockView.element, "package-history").length, 0);
    mockView.destroy();

    const live = fixture("live");
    const liveView = createJobList({ store: live.store, sourceMode: "live" });
    void liveView.showJobDetails({ jobId: "missing" });
    assert.equal(findByClass(liveView.element, "package-history").length, 0);
    liveView.destroy();
  });
});

test("History list renders supplied text and optional context safely", () => {
  withDocument(() => {
    const list = createPackageHistoryList(
      [
        {
          dateTime: "2026-01-15T10:00:00Z",
          timeLabel: "15 Jan 2026, 10:00 UTC",
          title: "<img src=x onerror=alert(1)>",
          actor: "<script>Example</script>",
        },
        {
          dateTime: "2026-01-14T10:00:00Z",
          timeLabel: "14 Jan 2026, 10:00 UTC",
          title: "Example event",
          actor: "B123456",
          actorIdentity: "PROD\\B123456",
          context: "Workstream: Example / Workspace: Example",
        },
      ],
      { label: "Package history" }
    );
    const entries = findByTag(list, "li");
    assert.equal(entries.length, 2);
    assert.equal(
      findByClass(entries[0], "package-history__event")[0].textContent,
      "<img src=x onerror=alert(1)>"
    );
    assert.equal(
      findByClass(entries[0], "package-history__actor")[0].textContent,
      "<script>Example</script>"
    );
    const actor = findByClass(entries[1], "package-history__actor")[0];
    assert.equal(actor.textContent, "B123456");
    assert.equal(actor.title, "PROD\\B123456");
    assert.equal(findByTag(list, "img").length, 0);
    assert.equal(findByTag(list, "script").length, 0);
    assert.equal(findByClass(entries[0], "package-history__context").length, 0);
    assert.equal(findByClass(entries[1], "package-history__context").length, 1);
  });
});
