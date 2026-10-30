import assert from "node:assert/strict";
import test from "node:test";
import { createJobList } from "./jobList.js";

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
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
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
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
    return [];
  }

  focus() {
    this.focused = true;
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
    disabled ? "Refreshing Jobs" : "Refresh Jobs"
  );
  assert.equal(buttons[0].title, disabled ? "Refreshing Jobs" : "Refresh Jobs");
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
    assert.equal(findByClass(view.element, "job-details__status")[0].textContent, "To do");
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
    assert.equal(findByClass(view.element, "job-status-button").length, 3);
    assertRefreshIconButton(view.element);
    assert.ok(!elementText(view.element).includes('["package","enc","east"]'));

    view.showJobListFromDetails();
    assert.equal(findByClass(view.element, "job-card").length, 1);
    view.destroy();
  });
});

test("Jobs list Refresh is icon-only for both live and mock modes", () => {
  withDocument(() => {
    for (const source of ["live", "mock"]) {
      const { store } = fixture(source);
      const view = createJobList({ store, sourceMode: source });
      assertRefreshIconButton(view.element);
      view.destroy();
    }
  });
});

test("Busy Jobs Refresh remains visibly disabled with an accessible label", () => {
  withDocument(() => {
    const { store } = fixture("live");
    const getSnapshot = store.getSnapshot;
    store.getSnapshot = () => ({ ...getSnapshot(), isLoading: true });
    store.subscribe = (listener) => {
      listener(store.getSnapshot());
      return () => {};
    };
    const view = createJobList({ store, sourceMode: "live" });
    assertRefreshIconButton(view.element, { disabled: true });
    findByClass(view.element, "job-card__details-action")[0].dispatchEvent({ type: "click" });
    assertRefreshIconButton(view.element, { disabled: true });
    view.destroy();
  });
});

test("Missing Job details retain an icon-only Refresh recovery action", () => {
  withDocument(() => {
    const { store } = fixture("live");
    const view = createJobList({ store, sourceMode: "live" });
    void view.showJobDetails({ jobId: "missing-job" });
    assert.equal(findByClass(view.element, "job-list__state--error").length, 1);
    assertRefreshIconButton(view.element);
    view.destroy();
  });
});

test("Jobs detail Refresh stays icon-only in mock mode", () => {
  withDocument(() => {
    const { store } = fixture("mock");
    const view = createJobList({ store, sourceMode: "mock" });
    findByClass(view.element, "job-card__details-action")[0].dispatchEvent({ type: "click" });
    assertRefreshIconButton(view.element);
    view.destroy();
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
      findByClass(view.element, "job-details__fact-label").some((e) => e.textContent === "Job ID")
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
