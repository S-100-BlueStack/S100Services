import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflowNavigation, assignmentPath } from "./createWorkflowNavigation.js";

class Element extends EventTarget {
  hidden = false;
  attributes = new Map();
  children = [];
  focusCount = 0;
  focus() {
    this.focusCount++;
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  append(...children) {
    this.children.push(...children);
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture({ initialPath = "/" } = {}) {
  const locationRef = { pathname: initialPath };
  const historyChanges = [];
  const historyRef = {
    pushState(_state, _unused, path) {
      locationRef.pathname = path;
      historyChanges.push({ type: "push", path });
    },
    replaceState(_state, _unused, path) {
      locationRef.pathname = path;
      historyChanges.push({ type: "replace", path });
    },
  };
  const windowRef = new EventTarget();
  const button = new Element();
  const home = new Element();
  const lastUpdated = new Element();
  const navbar = {
    element: {
      querySelector(selector) {
        return {
          "#feature-assignment-toggle": button,
          ".navbar-title-link": home,
          "#last-updated": lastUpdated,
        }[selector];
      },
    },
    jobsButton: new Element(),
    filtersButton: new Element(),
    filtersPopover: new Element(),
  };
  const jobsWorkflowHost = new Element();
  const shellElement = new Element();
  const page = {
    element: new Element(),
    allowLeave: async () => true,
    activate() {},
    selectPackage: async () => true,
    destroy() {},
  };
  let jobsOpens = 0;
  let onPackageSelected;
  const navigation = createWorkflowNavigation({
    locationRef,
    historyRef,
    windowRef,
    navbar,
    shellElement,
    jobsWorkflowHost,
    createPage(options) {
      onPackageSelected = options.onPackageSelected;
      return page;
    },
    onOpenJobs() {
      jobsOpens++;
    },
  });
  return {
    navigation,
    page,
    navbar,
    button,
    home,
    jobsWorkflowHost,
    locationRef,
    historyChanges,
    getJobsOpens: () => jobsOpens,
    async selectPackage(id) {
      onPackageSelected(id);
    },
    pop(path) {
      locationRef.pathname = path;
      windowRef.dispatchEvent(new Event("popstate"));
    },
  };
}

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
};

async function openPackage(f, id = "A") {
  assert.equal(await f.navigation.openAssignment(), true);
  await f.selectPackage(id);
  assert.equal(f.locationRef.pathname, assignmentPath(id));
}

test("Back then Forward while leave decision is pending cannot hide the accepted Package route", async () => {
  const f = fixture();
  await openPackage(f);
  const leave = deferred();
  let decisions = 0;
  f.page.allowLeave = () => {
    decisions++;
    return leave.promise;
  };

  f.pop("/");
  await flush();
  f.pop("/assignments/packages/A");
  await flush();
  leave.resolve(true);
  await flush();
  await flush();

  assert.equal(decisions, 1);
  assert.equal(f.locationRef.pathname, "/assignments/packages/A");
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.page.element.hidden, false);
  assert.equal(f.button.attributes.get("aria-current"), "page");
  assert.equal(f.getJobsOpens(), 0);
  assert.equal(
    f.historyChanges.some(({ type }) => type === "replace"),
    false
  );
  f.navigation.destroy();
});

test("Latest Back intent wins over older history decisions without a duplicate confirmation", async () => {
  const f = fixture();
  await openPackage(f);
  const leave = deferred();
  let decisions = 0;
  f.page.allowLeave = () => {
    decisions++;
    return leave.promise;
  };

  f.pop("/");
  f.pop("/assignments/packages/A");
  f.pop("/");
  leave.resolve(true);
  await flush();
  await flush();

  assert.equal(decisions, 1);
  assert.equal(f.locationRef.pathname, "/");
  assert.equal(f.jobsWorkflowHost.hidden, false);
  assert.equal(f.page.element.hidden, true);
  assert.equal(f.home.attributes.get("aria-current"), "page");
  assert.equal(f.getJobsOpens(), 1);
  f.navigation.destroy();
});

test("A canceled leave restores the accepted Package URL without opening Jobs", async () => {
  const f = fixture();
  await openPackage(f);
  const leave = deferred();
  f.page.allowLeave = () => leave.promise;
  f.pop("/");
  leave.resolve(false);
  await flush();

  assert.equal(f.locationRef.pathname, "/assignments/packages/A");
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.deepEqual(f.historyChanges.at(-1), {
    type: "replace",
    path: "/assignments/packages/A",
  });
  assert.equal(f.getJobsOpens(), 0);
  f.navigation.destroy();
});

test("Button navigation supersedes pending history without stale Jobs visibility", async () => {
  const f = fixture();
  await openPackage(f);
  const leave = deferred();
  f.page.allowLeave = () => leave.promise;
  f.pop("/");
  const assignment = f.navigation.openAssignment();
  leave.resolve(true);
  assert.equal(await assignment, true);

  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.locationRef.pathname, "/assignments/packages/A");
  assert.equal(f.getJobsOpens(), 0);
  f.navigation.destroy();
});

test("Destroy prevents deferred decisions from publishing or reopening the Jobs host", async () => {
  const f = fixture();
  await openPackage(f);
  const leave = deferred();
  f.page.allowLeave = () => leave.promise;
  f.pop("/");
  f.pop("/assignments/packages/A");
  f.navigation.destroy();
  leave.resolve(true);
  await flush();
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.getJobsOpens(), 0);
});

test("Cancel applies to the newest Back intent without opening another leave dialog", async () => {
  const f = fixture();
  await openPackage(f);
  const leave = deferred();
  let decisions = 0;
  f.page.allowLeave = () => {
    decisions++;
    return leave.promise;
  };
  f.pop("/");
  f.pop("/assignments/packages/A");
  f.pop("/");
  leave.resolve(false);
  await flush();
  await flush();

  assert.equal(decisions, 1);
  assert.equal(f.locationRef.pathname, "/assignments/packages/A");
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.getJobsOpens(), 0);
  f.navigation.destroy();
});

test("A superseded deep-link selection cannot accept an older URL", async () => {
  const f = fixture();
  await f.navigation.openAssignment();
  const firstSelection = deferred();
  const selected = [];
  f.page.selectPackage = (id) => {
    selected.push(id);
    return id === "A" ? firstSelection.promise : Promise.resolve(true);
  };
  f.pop("/assignments/packages/A");
  await flush();
  f.pop("/assignments/packages/B");
  firstSelection.resolve(true);
  await flush();
  await flush();

  assert.deepEqual(selected, ["A", "B"]);
  assert.equal(f.locationRef.pathname, "/assignments/packages/B");
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.page.element.hidden, false);
  f.navigation.destroy();
});
