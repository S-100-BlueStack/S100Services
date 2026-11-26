import assert from "node:assert/strict";
import test from "node:test";
import { bindingCommentKey } from "../../../shared/api/bindingComments.js";
import { createJobList } from "./jobList.js";
import { createPackageHistoryList } from "./createPackageHistory.js";
import { createJobsOverlay } from "../../../app/ui/createJobsOverlay.js";
import { createWorkflowNavigation } from "../../../app/ui/createWorkflowNavigation.js";
import { createJobsPanelActions } from "../../../app/ui/createJobsPanelActions.js";
import { createDraftNavigation } from "../../assignmentPage/ui/confirmDraftNavigation.js";
import { createLiveAssignmentServices } from "../../assignments/services/liveAssignmentServices.js";
import { createAssignmentSession } from "../../assignments/state/createAssignmentSession.js";
import { createJobStore } from "../state/jobStore.js";

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = {};
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

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }

  get nextElementSibling() {
    return this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null;
  }

  insertBefore(child, next) {
    child.remove();
    child.parent = this;
    this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, child);
  }

  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
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
      if (selector === '[data-job-focus="comments"]' && node.dataset.jobFocus === "comments") {
        return node;
      }
      if (selector === "[data-job-id]" && node.dataset.jobId) return node;
      if (selector === "details:not([open])" && node.tagName === "details" && !node.open) {
        return node;
      }
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

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, listener) {
    const existing = this.listeners.get(name) ?? [];
    this.listeners.set(name, [...existing, listener]);
  }

  removeEventListener(name, listener) {
    this.listeners.set(name, this.listeners.get(name)?.filter((item) => item !== listener) ?? []);
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
    if (selector === '[data-job-focus="comments"]')
      return descendants(this).filter((element) => element.dataset.jobFocus === "comments");
    if (selector === "[data-job-focus]")
      return descendants(this).filter((element) => element.dataset.jobFocus);
    return [];
  }

  focus() {
    this.focused = true;
    if (globalThis.document) globalThis.document.activeElement = this;
  }

  getBoundingClientRect() {
    if (this.rect) return this.rect;
    if (this.classList.contains("data-catalogue-jobs-overlay")) {
      return { left: 0, right: 500, top: 0, bottom: 550 };
    }
    if (this.classList.contains("data-catalogue-overlay-panel__header")) {
      return { bottom: 42 };
    }
    return { left: 336, right: 360, top: 140, bottom: 164 };
  }

  showPopover() {
    this.topLayerOpen = true;
    this.offsetWidth = 250;
    this.offsetHeight = 140;
  }

  hidePopover() {
    this.topLayerOpen = false;
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
  globalThis.document = Object.assign(new TestElement("document"), {
    createElement: (name) => new TestElement(name),
  });
  globalThis.window = Object.assign(new TestElement("window"), {
    innerWidth: 800,
    innerHeight: 600,
    requestAnimationFrame: (callback) => callback(),
    setTimeout: () => 0,
  });
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

test("History profiles preserve the recorded account and show an accessible avatar fallback", () => {
  withDocument(() => {
    const list = createPackageHistoryList(
      [
        {
          dateTime: "2026-01-15T10:00:00Z",
          timeLabel: "15 Jan 2026, 10:00 UTC",
          title: "Package created",
          actor: "B123456",
          actorIdentity: "PROD\\B123456",
          profile: {
            displayName: "Example <name>",
            photoSrc: "data:image/jpeg;base64,/9j/AA==",
          },
        },
        { actor: "B654321", actorIdentity: "PROD\\B654321", title: "Workstream assigned" },
        { actor: "System", actorIdentity: "System", title: "Package created" },
        { actor: "Actor not recorded", actorIdentity: null, title: "Package created" },
      ],
      { label: "Package history" }
    );
    const actors = findByClass(list, "package-history__actor");
    assert.equal(actors[0].textContent, "Example <name> (B123456)");
    assert.equal(actors[0].title, "PROD\\B123456");
    assert.equal(actors[1].textContent, "B654321");
    assert.equal(actors[2].textContent, "System");
    assert.equal(actors[3].textContent, "Actor not recorded");
    const avatars = findByClass(list, "package-history__avatar");
    assert.equal(avatars.length, 2);
    assert.equal(avatars[0].attributes.get("aria-hidden"), "true");
    assert.equal(findByTag(avatars[1], "calcite-icon")[0].icon, "user");
    const image = findByTag(list, "img")[0];
    assert.equal(image.alt, "");
    assert.equal(image.hidden, true);
    image.dispatchEvent({ type: "load" });
    assert.equal(image.hidden, false);
    image.dispatchEvent({ type: "error" });
    assert.equal(image.hidden, true);
  });
});

test("Profile enrichment updates only History and preserves the mounted scroll and focus", async () => {
  await withAsyncDocument(async () => {
    const { store, job } = fixture("live");
    const calls = [];
    let resolveProfile;
    const overlay = createJobsOverlay({
      jobStore: store,
      sourceMode: "live",
      async readPackageHistory() {
        return {
          items: [recordedHistoryEvent("event", { actor: "PROD\\B123456" })],
          nextBefore: null,
        };
      },
      readPackageHistoryProfile(id, eventId, options) {
        calls.push({ id, eventId, options });
        return new Promise((resolve) => {
          resolveProfile = resolve;
        });
      },
    });
    try {
      assert.equal(calls.length, 0);
      await overlay.showJobDetails({ jobId: job.id });
      await Promise.resolve();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].id, job.packageId);
      assert.equal(calls[0].eventId, "event");
      const details = findByClass(overlay.element, "job-details")[0];
      const history = findByClass(details, "package-history")[0];
      const scroll = findByClass(history, "package-history__scroll")[0];
      assert.equal(findByClass(history, "package-history__actor")[0].textContent, "B123456");
      scroll.scrollTop = 32;
      scroll.focus();
      resolveProfile({ displayName: "Example user", photoSrc: null });
      await Promise.resolve();
      assert.equal(findByClass(overlay.element, "job-details")[0], details);
      assert.equal(findByClass(history, "package-history__scroll")[0], scroll);
      assert.equal(scroll.scrollTop, 32);
      assert.equal(document.activeElement, scroll);
      assert.equal(
        findByClass(history, "package-history__actor")[0].textContent,
        "Example user (B123456)"
      );
      assert.equal(findByClass(overlay.packageInformationElement, "package-history").length, 0);
    } finally {
      overlay.destroy();
    }
  });
});

test("Accepted navigation refreshes only after binding changes and joins Packages open and Refresh", async (t) => {
  await withAsyncDocument(async () => {
    const job = { ...fixture("live").job, pipelineId: "enc", workspaceId: "east" };
    const bindings = new Map();
    const comments = [];
    const availabilityCalls = [];
    const reads = [];
    let finishRead;
    let delayRead = false;
    const store = createJobStore({
      service: {
        async loadJobs(options) {
          reads.push(options);
          if (delayRead) {
            delayRead = false;
            await new Promise((resolve) => {
              finishRead = resolve;
            });
          }
          const jobs = bindings.has(job.packageId) ? [job] : [];
          return { ok: true, data: { jobs, workspaceCatalogue: { workspaces: [] } } };
        },
      },
    });
    const session = createAssignmentSession({
      services: createLiveAssignmentServices(
        {
          package: async (id) => ({ id }),
          bindings: async (id) => bindings.get(id) ?? [],
          async bind(packageId, pipelineId) {
            const item = { id: packageId, packageId, pipelineId, workspaces: [] };
            bindings.set(packageId, [...(bindings.get(packageId) ?? []), item]);
          },
          async unbind(id) {
            bindings.delete(id);
          },
          bindingComments: async () => ({ items: comments, nextBefore: null }),
          async addBindingComment(_id, comment) {
            comments.push({ id: comment.id, pipelineId: comment.workStreamId, text: comment.text });
          },
        },
        {
          onMembershipInvalidated: store.invalidateMembership,
          onCommentsInvalidated: (binding) => overlay.invalidateComments(binding),
        }
      ),
    });
    const overlay = createJobsOverlay({
      jobStore: store,
      sourceMode: "live",
      async readCommentAvailability(bindings) {
        availabilityCalls.push(bindings);
        return new Map(bindings.map((pair) => [bindingCommentKey(pair), comments.length > 0]));
      },
      readBindingComments: async () => assert.fail("Navigation must not preload comment text"),
    });
    const assignmentHost = new TestElement("assignment");
    const guard = createDraftNavigation({
      session,
      host: assignmentHost,
      onSaved() {},
    });
    const dialog = assignmentHost.children[0];
    let waitingForChoice = false;
    dialog.showModal = () => {
      waitingForChoice = true;
    };
    dialog.remove = () => {};
    function choose(choice) {
      assert.equal(waitingForChoice, true);
      waitingForChoice = false;
      dialog.returnValue = choice;
      dialog.dispatchEvent({ type: "close" });
    }

    const button = new TestElement("assignment-button");
    const home = new TestElement("home");
    const updated = new TestElement("updated");
    const navbar = {
      element: {
        querySelector: (selector) =>
          ({
            "#feature-assignment-toggle": button,
            ".navbar-title-link": home,
            "#last-updated": updated,
          })[selector],
      },
      jobsButton: new TestElement("jobs-button"),
      filtersButton: new TestElement("filters-button"),
      filtersPopover: new TestElement("filters-popover"),
    };
    const jobsWorkflowHost = new TestElement("jobs-workflow");
    jobsWorkflowHost.append(overlay.element);
    const locationRef = { pathname: "/catalogue/assignments" };
    const historyRef = {
      pushState(_state, _title, pathname) {
        locationRef.pathname = pathname;
      },
      replaceState(_state, _title, pathname) {
        locationRef.pathname = pathname;
      },
    };
    const windowRef = new EventTarget();
    const panelActions = createJobsPanelActions({
      isOpen: () => !overlay.element.hidden,
      resetContext: overlay.clearSelectedJob,
      prepareOpen() {
        overlay.clearAoiFilter();
        void overlay.refreshJobs({ onPanelOpen: true });
      },
      setOpen(open) {
        overlay.element.hidden = !open;
        overlay.setPanelOpen(open);
      },
    });
    let returns = 0;
    let completion;
    let routeToPackage;
    const navigation = createWorkflowNavigation({
      shellElement: new TestElement("shell"),
      navbar,
      jobsWorkflowHost,
      locationRef,
      historyRef,
      windowRef,
      createPage({ onPackageSelected }) {
        routeToPackage = onPackageSelected;
        return {
          element: assignmentHost,
          activate() {},
          deactivate: session.clearSaveConfirmation,
          allowLeave: guard.allow,
          selectPackage: session.select,
          destroy: guard.destroy,
        };
      },
      onOpenJobs: panelActions.open,
      onLeaveMainMap() {
        overlay.setMainMapActive(false);
        store.cancelNavigationLoad();
      },
      onReturnMainMap({ openJobs }) {
        returns++;
        if (store.hasPendingMembershipRefresh()) {
          completion = overlay.refreshJobs({ afterAssignment: true });
        }
        overlay.setMainMapActive(true, { openJobs });
      },
    });
    const flush = () => new Promise(setImmediate);
    try {
      await flush();
      assert.equal(jobsWorkflowHost.hidden, true);
      assert.equal(button.focused, undefined, "Direct Assignment does not force focus");
      overlay.element.hidden = true;
      await store.loadJobs();
      const startingReads = reads.length;

      await session.select(job.packageId);
      routeToPackage(job.packageId);
      session.setAssigned(job.pipelineId, true);
      home.dispatchEvent(new Event("click"));
      choose("cancel");
      await flush();
      assert.equal(locationRef.pathname, "/catalogue/assignments/packages/package");
      assert.equal(returns, 0);
      assert.equal(reads.length, startingReads);

      home.dispatchEvent(new Event("click"));
      choose("discard");
      await flush();
      assert.equal(returns, 1);
      assert.equal(overlay.element.hidden, true);
      assert.equal(reads.length, startingReads);
      t.diagnostic(
        "Canceled leave and unchanged/discarded Home return: 0 logical membership loads"
      );

      await navigation.openAssignment();
      session.setAssigned(job.pipelineId, true);
      home.dispatchEvent(new Event("click"));
      choose("save");
      await flush();
      assert.ok(completion, JSON.stringify(session.snapshot()));
      assert.equal(await completion.then(({ ok }) => ok), true);
      assert.equal(locationRef.pathname, "/catalogue/");
      assert.equal(jobsWorkflowHost.hidden, false);
      assert.equal(overlay.element.hidden, true, "Home preserves the closed panel");
      assert.equal(store.getSnapshot().jobs[0].id, job.id);
      assert.equal(session.snapshot().saveConfirmed, false, "Deactivation clears Save feedback");

      await navigation.openAssignment();
      assert.equal(await session.save(), true, "Clean Save has no membership effect");
      assert.equal(session.addComment(job.pipelineId), true);
      session.editComment(
        session.snapshot().draft.comments[0].id,
        "A comment on the saved binding"
      );
      assert.equal(await session.save(), true);
      assert.equal(session.snapshot().saveConfirmed, true);
      const beforeCommentReturn = reads.length;
      await navigation.openJobs();
      assert.equal(overlay.element.hidden, false);
      assert.equal(reads.length, beforeCommentReturn);
      assert.deepEqual(
        availabilityCalls,
        [[{ packageId: "package", pipelineId: "enc" }]],
        "Hidden dirty return and open share a round"
      );
      t.diagnostic(
        "Clean Save and comment-only return to a recent Packages panel: 0 membership loads"
      );

      await navigation.openAssignment();
      for (const packageId of ["another", "third"]) {
        await session.select(packageId);
        routeToPackage(packageId);
        session.setAssigned(job.pipelineId, true);
        assert.equal(await session.save(), true);
      }
      const beforeHistoryReturn = reads.length;
      const assignmentPath = locationRef.pathname;
      delayRead = true;
      locationRef.pathname = "/catalogue/";
      windowRef.dispatchEvent(new Event("popstate"));
      await flush();
      overlay.refreshButton.dispatchEvent({ type: "click" });
      assert.equal(reads.length - beforeHistoryReturn, 1);
      assert.equal(reads.at(-1).freshWorkspaceCatalogue, true);
      assert.equal(overlay.element.hidden, false);
      finishRead();
      assert.equal((await completion).ok, true);
      assert.deepEqual(availabilityCalls, [
        [{ packageId: "package", pipelineId: "enc" }],
        [{ packageId: "package", pipelineId: "enc" }],
      ]);
      t.diagnostic("Two Package saves + browser Back + Packages open + Refresh: 1 membership load");

      locationRef.pathname = assignmentPath;
      windowRef.dispatchEvent(new Event("popstate"));
      await flush();
      assert.equal(jobsWorkflowHost.hidden, true);
      locationRef.pathname = "/catalogue/";
      windowRef.dispatchEvent(new Event("popstate"));
      await flush();
      assert.equal(
        reads.length - beforeHistoryReturn,
        1,
        "Unchanged history return reuses the list"
      );

      overlay.setPipelineCatalogue([
        {
          id: "enc",
          name: "ENC",
          workspaces: [{ pipelineId: "enc", workspaceId: "east", name: "East" }],
        },
      ]);
      assert.equal(availabilityCalls.length, 2, "Unchanged history return reuses the summary");
      const scope = overlay.getWorkScope();
      await overlay.showJobDetails(job);
      assert.equal(findByClass(overlay.element, "job-details").length, 1);
      await navigation.openAssignment();
      await session.select("another");
      session.setAssigned(job.pipelineId, false);
      assert.equal(await session.save(), true);
      home.dispatchEvent(new Event("click"));
      await flush();
      assert.equal((await completion).ok, true);
      assert.equal(
        findByClass(overlay.element, "job-details").length,
        1,
        "Valid selection survives"
      );

      await navigation.openAssignment();
      await session.select(job.packageId);
      session.setAssigned(job.pipelineId, false);
      assert.equal(await session.save(), true);
      home.dispatchEvent(new Event("click"));
      await flush();
      assert.equal((await completion).ok, true);
      assert.equal(
        findByClass(overlay.element, "job-details").length,
        0,
        "Removed selection clears"
      );
      assert.deepEqual(overlay.getWorkScope(), scope);
      assert.equal(overlay.element.hidden, false, "Home preserves the open panel");
    } finally {
      navigation.destroy();
      session.destroy();
      overlay.destroy();
      store.destroy();
    }
  });
});

test("CARIS and ESRI are separate popups; ENC and a different Package have no comments", async () => {
  await withAsyncDocument(async () => {
    const { job } = fixture("live");
    const makeJob = (id, pipelineId, pipelineName, workspaceId, packageId = "nm-1041-24") => ({
      ...job,
      id,
      packageId,
      pipelineId,
      pipelineName,
      workspaceId,
    });
    const jobs = [
      makeJob("caris-east", "caris", "Paper Chart CARIS", "east"),
      makeJob("caris-west", "caris", "Paper Chart CARIS", "west"),
      makeJob("esri", "esri", "Paper Chart ESRI", "east"),
      makeJob("enc", "enc", "ENC", "east"),
      makeJob("other", "caris", "Paper Chart CARIS", "east", "different-package"),
    ];
    const store = createJobStore({
      service: { loadJobs: async () => ({ ok: true, data: { jobs } }) },
    });
    const calls = [];
    const pages = [];
    const raw = "<img src=x onerror=alert(1)>\nPaper Chart CARIS";
    const overlay = createJobsOverlay({
      jobStore: store,
      sourceMode: "live",
      async readCommentAvailability(pairs) {
        calls.push(pairs);
        return new Map(
          pairs.map((pair) => [
            bindingCommentKey(pair),
            pair.packageId === "nm-1041-24" && pair.pipelineId !== "enc",
          ])
        );
      },
      readBindingComments(packageId, { pipelineId, signal }) {
        return new Promise((resolve) => {
          pages.push({ packageId, pipelineId, signal, resolve });
        });
      },
    });
    const flush = () => new Promise(setImmediate);
    const click = (button) => button.dispatchEvent({ type: "click" });
    const comment = (pipelineId, text) => ({
      id: pipelineId,
      pipelineId,
      occurredAtUtc: "2026-11-25T13:00:00Z",
      text,
      actor: "PROD\\reader",
    });
    try {
      overlay.setPanelOpen(true);
      await store.loadJobs();
      await flush();
      const find = (id) =>
        findByClass(overlay.element, "job-card__comments").find(
          (button) => button.dataset.commentJobId === id
        );
      const east = find("caris-east");
      const west = find("caris-west");
      const [viewer] = findByClass(overlay.element, "package-comment-viewer");
      const list = findByClass(overlay.element, "job-list")[0];
      assert.equal(viewer.parent, overlay.element);
      assert.equal(list.contains(viewer), false);
      assert.equal(viewer.getAttribute("popover"), "manual");
      assert.equal(east.parent.className, "job-card__badge-column");
      assert.equal(east.dataset.availability, "present");
      assert.equal(west.dataset.availability, "present");
      assert.equal(find("esri").dataset.availability, "present");
      assert.equal(find("enc").dataset.availability, "absent");
      assert.equal(find("other").dataset.availability, "absent");
      assert.match(find("enc").getAttribute("aria-label"), /ENC/);
      assert.deepEqual(
        calls.map((batch) => batch.length),
        [4]
      );
      assert.equal(pages.length, 0);
      const pointerListeners = document.listeners.get("pointerdown").length;

      click(east);
      west.rect = { left: 300, right: 324, top: 260, bottom: 284 };
      document.dispatchEvent({ type: "pointerdown", target: west });
      click(west);
      assert.equal(viewer.topLayerOpen, true);
      assert.equal(viewer.style.top, "288px");
      assert.equal(viewer.getAttribute("role"), "dialog");
      assert.equal(findByClass(overlay.element, "job-details").length, 0);
      assert.deepEqual(
        pages.map(({ packageId, pipelineId }) => [packageId, pipelineId]),
        [["nm-1041-24", "caris"]]
      );

      const focus = document.activeElement;
      pages[0].resolve({ items: [comment("caris", raw)], nextBefore: null });
      await flush();
      assert.equal(document.activeElement, focus);
      assert.equal(findByClass(viewer, "package-comment-viewer__text")[0].textContent, raw);
      assert.equal(findByTag(viewer, "img").filter((image) => !image.hidden).length, 0);
      assert.match(elementText(viewer), /Comments · Paper Chart CARIS/);
      west.rect = { left: 300, right: 324, top: 492, bottom: 516 };
      window.dispatchEvent({ type: "scroll", target: overlay.element });
      assert.equal(viewer.style.top, "348px", "A low anchor opens above its trigger");
      viewer.dispatchEvent({
        type: "keydown",
        key: "Escape",
        preventDefault() {},
        stopPropagation() {},
      });
      assert.equal(viewer.topLayerOpen, false);
      assert.equal(document.activeElement, west);
      assert.equal(pages[0].signal.aborted, true);

      click(find("esri"));
      pages[1].resolve({ items: [comment("esri", "ESRI only")], nextBefore: null });
      await flush();
      assert.match(elementText(viewer), /Comments · Paper Chart ESRI/);
      assert.doesNotMatch(elementText(viewer), /Paper Chart CARIS/);
      click(find("esri"));
      assert.equal(viewer.topLayerOpen, false);

      click(find("enc"));
      pages[2].resolve({ items: [], nextBefore: null });
      await flush();
      assert.match(elementText(viewer), /No saved comments/);
      assert.doesNotMatch(elementText(viewer), /ESRI only/);
      document.dispatchEvent({ type: "pointerdown", target: overlay.refreshButton });
      assert.equal(viewer.topLayerOpen, false);
      assert.notEqual(
        document.activeElement,
        find("enc"),
        "Outside pointer leaves focus to its target"
      );

      click(east);
      const group = findByClass(overlay.element, "job-list__package-group")[0];
      group.isConnected = true;
      group.open = false;
      group.dispatchEvent({ type: "toggle" });
      assert.equal(viewer.topLayerOpen, false);
      assert.equal(pages[3].signal.aborted, true);
      assert.equal(calls.length, 1, "Popup gestures and collapsing do not reload the summary");
      assert.equal(document.listeners.get("pointerdown").length, pointerListeners);
    } finally {
      overlay.destroy();
    }
  });
});
