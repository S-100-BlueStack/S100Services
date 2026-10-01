import test from "node:test";
import assert from "node:assert/strict";
import { createJobsPanelActions } from "./createJobsPanelActions.js";
import { createWorkflowNavigation } from "./createWorkflowNavigation.js";

class Element extends EventTarget {
  hidden = false;
  inert = false;
  attributes = new Map();
  classes = new Set();
  children = [];
  classList = {
    toggle: (name, active) => (active ? this.classes.add(name) : this.classes.delete(name)),
  };
  focus() {
    this.focused = true;
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

function fixture({ onOpenJobs, startupComplete = true } = {}) {
  const button = new Element();
  const home = new Element();
  const updated = new Element();
  const navbar = {
    element: {
      querySelector: (selector) =>
        ({
          "#feature-assignment-toggle": button,
          ".navbar-title-link": home,
          "#last-updated": updated,
        })[selector],
    },
    jobsButton: new Element(),
    filtersButton: new Element(),
    filtersPopover: new Element(),
  };
  const workspace = { element: new Element() };
  const startupLoader = { element: new Element() };
  const jobsWorkflowHost = new Element();
  jobsWorkflowHost.append(workspace.element, startupLoader.element);
  const shellElement = new Element();
  let creates = 0;
  let activations = 0;
  let destroys = 0;
  let jobsActions = 0;
  let jobsStartupComplete = startupComplete;
  const page = {
    element: new Element(),
    allowLeave: async () => true,
    activate() {
      activations++;
    },
    destroy() {
      destroys++;
    },
  };
  const navigation = createWorkflowNavigation({
    shellElement,
    jobsWorkflowHost,
    navbar,
    createPage() {
      creates++;
      return page;
    },
    onOpenJobs:
      onOpenJobs ??
      (() => {
        jobsActions++;
      }),
    isJobsStartupComplete: () => jobsStartupComplete,
  });
  return {
    navigation,
    workspace,
    page,
    navbar,
    button,
    startupLoader,
    jobsWorkflowHost,
    setStartupComplete(value) {
      jobsStartupComplete = value;
      navigation.syncJobsButtonState();
    },
    counts: () => ({ creates, activations, destroys, jobsActions }),
  };
}

test("Jobs remains default and assignment initializes once without waiting for Jobs startup", async () => {
  const f = fixture();
  assert.equal(f.counts().creates, 0);
  assert.equal(f.jobsWorkflowHost.hidden, false);
  await f.navigation.openAssignment();
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.navbar.filtersButton.hidden, true);
  await f.navigation.openAssignment();
  assert.equal(f.counts().creates, 1);
  assert.equal(f.counts().activations, 1);
  await f.navigation.openJobs();
  assert.equal(f.jobsWorkflowHost.hidden, false);
  assert.equal(f.page.element.hidden, true);
  assert.equal(f.navbar.filtersButton.hidden, false);
  assert.equal(f.counts().jobsActions, 1);
  f.navigation.destroy();
  assert.equal(f.counts().destroys, 1);
});

test("A startup failure that publishes while assignment is open keeps Jobs navigation available", async () => {
  const f = fixture();
  await f.navigation.openAssignment();

  f.setStartupComplete(false);

  assert.equal(f.navbar.jobsButton.disabled, false);
  assert.equal(await f.navigation.openJobs(), true);
  assert.equal(f.jobsWorkflowHost.hidden, false);
  assert.equal(f.navbar.jobsButton.disabled, true);
  assert.equal(f.counts().jobsActions, 0);
  f.navigation.destroy();
});

test("A blocked Jobs startup remains blocked while Feature assignment stays reachable", async () => {
  const f = fixture({ startupComplete: false });
  f.workspace.element.inert = true;
  f.workspace.element.setAttribute("aria-hidden", "true");
  f.startupLoader.element.inert = false;
  f.navbar.jobsButton.disabled = true;

  assert.equal(await f.navigation.openAssignment(), true);
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.workspace.element.inert, true);
  assert.equal(f.startupLoader.element.inert, false);
  assert.equal(f.navbar.jobsButton.disabled, false);

  assert.equal(await f.navigation.openJobs(), true);
  assert.equal(f.jobsWorkflowHost.hidden, false);
  assert.equal(f.workspace.element.inert, true);
  assert.equal(f.workspace.element.attributes.get("aria-hidden"), "true");
  assert.equal(f.startupLoader.element.inert, false);
  assert.equal(f.navbar.jobsButton.disabled, true);
  assert.equal(f.counts().jobsActions, 0);
  f.navigation.destroy();
});

for (const choice of ["clean state", "Discard changes", "successful Save and continue"]) {
  test(`${choice} opens Jobs exactly once after leaving assignment`, async () => {
    const f = fixture();
    await f.navigation.openAssignment();
    let decisions = 0;
    f.page.allowLeave = async () => {
      decisions++;
      return true;
    };
    assert.equal(await f.navigation.openJobs(), true);
    assert.equal(decisions, 1);
    assert.equal(f.counts().jobsActions, 1);
    assert.equal(f.jobsWorkflowHost.hidden, false);
    assert.equal(f.page.element.hidden, true);
    f.navigation.destroy();
  });
}

for (const choice of ["failed Save", "Cancel or closed confirmation"]) {
  test(`${choice} keeps assignment open without opening Jobs`, async () => {
    const f = fixture();
    await f.navigation.openAssignment();
    f.page.allowLeave = async () => false;
    assert.equal(await f.navigation.openJobs(), false);
    assert.equal(f.counts().jobsActions, 0);
    assert.equal(f.jobsWorkflowHost.hidden, true);
    assert.equal(f.page.element.hidden, false);
    assert.equal(f.button.attributes.get("aria-pressed"), "true");
    f.navigation.destroy();
  });
}

test("DataCatalogue title leaves assignment without opening Jobs", async () => {
  const f = fixture();
  await f.navigation.openAssignment();
  f.navbar.element.querySelector(".navbar-title-link").dispatchEvent(new Event("click"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.jobsWorkflowHost.hidden, false);
  assert.equal(f.counts().jobsActions, 0);
  f.navigation.destroy();
});

test("Jobs navbar click completes one Jobs action without synthetic recursion", async () => {
  const f = fixture();
  await f.navigation.openAssignment();
  f.navbar.jobsButton.dispatchEvent(new Event("click"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.jobsWorkflowHost.hidden, false);
  assert.equal(f.counts().jobsActions, 1);
  f.navigation.destroy();
});

for (const initiallyOpen of [false, true]) {
  test(`Assignment Jobs navigation leaves a ${initiallyOpen ? "previously open" : "previously closed"} panel open`, async () => {
    let panelOpen = initiallyOpen;
    let refreshes = 0;
    let closes = 0;
    let openWrites = 0;
    const jobsActions = createJobsPanelActions({
      isOpen: () => panelOpen,
      resetContext() {},
      prepareOpen() {
        refreshes++;
      },
      prepareClose() {
        closes++;
      },
      setOpen(value) {
        panelOpen = value;
        openWrites++;
      },
    });
    const f = fixture({ onOpenJobs: jobsActions.open });
    await f.navigation.openAssignment();
    await f.navigation.openJobs();
    assert.equal(panelOpen, true);
    assert.equal(refreshes, 1);
    assert.equal(closes, 0);
    assert.equal(openWrites, 1);
    f.navigation.destroy();
  });
}

test("A pending navigation decision is not duplicated and cannot publish after destroy", async () => {
  const f = fixture();
  await f.navigation.openAssignment();
  let resolve;
  let decisions = 0;
  f.page.allowLeave = () => {
    decisions++;
    return new Promise((done) => {
      resolve = done;
    });
  };
  const pending = f.navigation.openJobs();
  await f.navigation.openJobs();
  assert.equal(decisions, 1);
  f.navigation.destroy();
  resolve(true);
  await pending;
  assert.equal(f.jobsWorkflowHost.hidden, true);
  assert.equal(f.counts().jobsActions, 0);
});
