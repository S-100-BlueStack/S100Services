import assert from "node:assert/strict";
import test from "node:test";
import { createPackageActionSession, isPackageDemoEnabled } from "./packageActionSession.js";

const PACKAGE_ID = "71ccb411-30f7-4b58-bb85-4af5f6c9872e";
const BASE = "electronicproducts/packages/PRIMARY";

test("demo Send/Accept requires explicit Vite development opt-in", () => {
  assert.equal(isPackageDemoEnabled({ DEV: true, VITE_PACKAGE_DEMO_ENABLED: "true" }), true);
  assert.equal(isPackageDemoEnabled({ DEV: true, VITE_PACKAGE_DEMO_ENABLED: "false" }), false);
  assert.equal(isPackageDemoEnabled({ DEV: true }), false);
  assert.equal(isPackageDemoEnabled({ DEV: false, VITE_PACKAGE_DEMO_ENABLED: "true" }), false);
  assert.equal(isPackageDemoEnabled({ VITE_PACKAGE_DEMO_ENABLED: "true" }), false);
});

function createHarness({ initial = {}, demoEnabled = false } = {}) {
  const requests = [];
  const notices = [];
  let changes = 0;
  let connected = true;
  const state = {
    packageId: PACKAGE_ID,
    sourceDatasetName: "PRIMARY",
    paused: false,
    controlVersion: "AAAAAAAAAAE=",
    canPause: true,
    canResume: false,
    canDiscard: true,
    eligibleMembers: [{ key: "s101", datasetName: "PRIMARY" }],
    ...initial,
  };
  const handler = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/actions")) return { success: true, data: { ...state } };
    if (url.endsWith("/pause"))
      return {
        success: true,
        data: {
          packageId: PACKAGE_ID,
          paused: true,
          controlVersion: "AAAAAAAAAAI=",
        },
      };
    if (url.endsWith("/resume"))
      return {
        success: true,
        data: {
          packageId: PACKAGE_ID,
          paused: false,
          controlVersion: "AAAAAAAAAAM=",
        },
      };
    if (url.endsWith("/discard")) return { success: true, data: { jobId: "job-1" } };
    if (url.endsWith("/discard-jobs/job-1"))
      return { success: true, data: { status: "Succeeded" } };
    throw new Error(`Unexpected request ${url}`);
  };
  const session = createPackageActionSession({
    sourceName: "PRIMARY",
    identityKey: "identity",
    memberNames: { s101: "PRIMARY", s57: "SECONDARY" },
    demoEnabled,
    isCurrent: () => connected,
    onChange: () => {
      changes++;
    },
    request: handler,
    notify: Object.fromEntries(
      ["error", "info", "warning", "success"].map((name) => [
        name,
        (...args) => notices.push([name, ...args]),
      ])
    ),
    wait: async () => {},
  });
  return {
    session,
    requests,
    notices,
    changes: () => changes,
    disconnect: () => {
      connected = false;
    },
    state,
  };
}

test("live Pause and Resume use the exact snapshot and successive SQL control tokens", async () => {
  const h = createHarness();
  await h.session.start();
  assert.equal(h.requests[0].url, `${BASE}/actions`);
  assert.equal(h.session.projection().actionEligibility.pause, true);
  assert.equal(await h.session.invoke("pause"), true);
  assert.equal(h.requests[1].url, `${BASE}/pause`);
  assert.deepEqual(JSON.parse(h.requests[1].options.body), {
    packageId: PACKAGE_ID,
    expectedControlVersion: "AAAAAAAAAAE=",
  });
  assert.equal(h.session.projection().paused, true);
  assert.equal(h.session.projection().actionEligibility.send, false);
  assert.equal(await h.session.invoke("resume"), true);
  assert.deepEqual(JSON.parse(h.requests[2].options.body), {
    packageId: PACKAGE_ID,
    expectedControlVersion: "AAAAAAAAAAI=",
  });
  assert.equal(h.session.projection().paused, false);
  assert.equal(h.notices.filter((item) => item[0] === "success").length, 2);
  h.session.destroy();
});

test("Send and Accept are local-only transitions with explicit demo notices", async () => {
  const h = createHarness({ demoEnabled: true });
  await h.session.start();
  assert.equal(h.session.projection().primaryAction, "send");
  assert.equal(await h.session.invoke("send"), true);
  assert.equal(h.session.projection().primaryAction, "accept");
  assert.equal(await h.session.invoke("accept"), true);
  assert.equal(h.session.projection().primaryAction, "send");
  assert.deepEqual(
    h.requests.map((request) => request.options.method),
    ["GET"]
  );
  assert.match(h.notices[0][2], /no products were sent/i);
  assert.match(h.notices[1][2], /no results were acknowledged/i);
  h.session.destroy();
});

test("the URL query cannot enable demo Send/Accept", async () => {
  const previousLocation = globalThis.location;
  globalThis.location = { search: "?packageDemo=1" };
  const session = createPackageActionSession({
    sourceName: "PRIMARY",
    identityKey: "identity",
    memberNames: { s101: "PRIMARY" },
    isCurrent: () => true,
    request: async () => ({
      success: true,
      data: {
        packageId: PACKAGE_ID,
        sourceDatasetName: "PRIMARY",
        paused: false,
        canPause: true,
        canResume: false,
        canDiscard: true,
        eligibleMembers: [],
      },
    }),
  });
  try {
    await session.start();
    assert.equal(session.projection().actionEligibility.send, false);
    assert.equal(await session.invoke("send"), false);
  } finally {
    session.destroy();
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
});

test("demo Send never becomes a live request even without an available backend snapshot", async () => {
  const h = createHarness({ demoEnabled: true, initial: { sourceDatasetName: "WRONG" } });
  await h.session.start();
  assert.equal(h.session.projection().actionEligibility.discard, false);
  assert.equal(await h.session.invoke("send"), true);
  assert.equal(await h.session.invoke("accept"), true);
  assert.equal(h.requests.length, 1);
  h.session.destroy();
});

test("an incomplete member track leaves all live package mutations disabled", async () => {
  const h = createHarness({
    demoEnabled: true,
    initial: {
      canPause: false,
      canResume: false,
      canDiscard: false,
      eligibleMembers: [],
      restrictionCode: "MEMBER_TRACK_MISSING",
    },
  });
  await h.session.start();
  const state = h.session.projection();
  assert.equal(state.liveVerified, true);
  assert.equal(state.restrictionCode, "MEMBER_TRACK_MISSING");
  assert.equal(state.actionEligibility.pause, false);
  assert.equal(state.actionEligibility.discard, false);
  assert.equal(await h.session.invoke("discard"), false);
  assert.deepEqual(
    h.requests.map((item) => item.options.method),
    ["GET"]
  );
  h.session.destroy();
});

test("Discard refreshes the popup after Worker success and before its notice", async () => {
  const calls = [];
  const state = {
    packageId: PACKAGE_ID,
    sourceDatasetName: "PRIMARY",
    paused: false,
    canPause: true,
    canResume: false,
    canDiscard: true,
    eligibleMembers: [],
  };
  const session = createPackageActionSession({
    sourceName: "PRIMARY",
    identityKey: "identity",
    memberNames: {},
    isCurrent: () => true,
    request: async (url) => {
      if (url.endsWith("/actions")) return { success: true, data: state };
      if (url.endsWith("/discard")) return { success: true, data: { jobId: "job-1" } };
      if (url.endsWith("/discard-jobs/job-1"))
        return { success: true, data: { status: "Succeeded" } };
      throw new Error(`Unexpected ${url}`);
    },
    onDiscardSucceeded: async () => {
      calls.push("refresh-attributes");
      return true;
    },
    notify: {
      success: () => calls.push("success"),
      error: () => assert.fail("No error expected"),
    },
  });
  await session.start();
  assert.equal(await session.invoke("discard"), true);
  assert.deepEqual(calls, ["refresh-attributes", "success"]);
  session.destroy();
});

test("a completed Discard remains successful if the selected details cannot be refreshed", async () => {
  const h = createHarness();
  const notices = [];
  const session = createPackageActionSession({
    sourceName: "PRIMARY",
    identityKey: "identity",
    memberNames: { s101: "PRIMARY" },
    isCurrent: () => true,
    request: async (url) => {
      if (url.endsWith("/actions")) return { success: true, data: h.state };
      if (url.endsWith("/discard")) return { success: true, data: { jobId: "job-1" } };
      return { success: true, data: { status: "Succeeded" } };
    },
    onDiscardSucceeded: async () => false,
    notify: {
      success: () => notices.push("success"),
      warning: () => notices.push("warning"),
    },
  });
  await session.start();
  assert.equal(await session.invoke("discard"), true);
  assert.deepEqual(notices, ["success", "warning"]);
  session.destroy();
  h.session.destroy();
});

test("Discard waits for the Worker before publishing a successful outcome", async () => {
  const h = createHarness();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  const refreshes = [];
  globalThis.window = { dispatchEvent: (event) => refreshes.push(event.type) };
  globalThis.CustomEvent = class {
    constructor(type) {
      this.type = type;
    }
  };
  try {
    await h.session.start();
    assert.equal(await h.session.invoke("discard"), true);
    assert.equal(h.requests[1].url, `${BASE}/discard`);
    assert.deepEqual(JSON.parse(h.requests[1].options.body), { packageId: PACKAGE_ID });
    assert.equal(h.requests[2].url, "electronicproducts/packages/discard-jobs/job-1");
    assert.deepEqual(refreshes, ["pc-package-action-refresh"]);
    assert.equal(
      h.notices.some((notice) => notice[0] === "success"),
      true
    );
    assert.equal(h.session.projection(), null);
  } finally {
    h.session.destroy();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("outdated server response after popup disposal cannot publish or mutate", async () => {
  let resolve;
  let changes = 0;
  const session = createPackageActionSession({
    sourceName: "PRIMARY",
    identityKey: "identity",
    memberNames: {},
    demoEnabled: false,
    isCurrent: () => true,
    onChange: () => {
      changes++;
    },
    request: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const started = session.start();
  session.destroy();
  resolve({
    success: true,
    data: {
      packageId: PACKAGE_ID,
      sourceDatasetName: "PRIMARY",
      paused: false,
      eligibleMembers: [],
    },
  });
  assert.equal(await started, undefined);
  assert.equal(session.projection(), null);
  assert.equal(changes, 0);
});

test("unverified member names fail closed before any live mutation", async () => {
  const h = createHarness({
    initial: { eligibleMembers: [{ key: "s57", datasetName: "UNDECLARED" }] },
  });
  await h.session.start();
  assert.equal(h.session.projection(), null);
  assert.equal(await h.session.invoke("pause"), false);
  assert.equal(h.requests.length, 1);
  h.session.destroy();
});

test("a simulated Send locks real Pause and Discard until demo Accept", async () => {
  const h = createHarness({ demoEnabled: true });
  await h.session.start();
  assert.equal(await h.session.invoke("send"), true);
  assert.equal(h.session.projection().actionEligibility.pause, false);
  assert.equal(h.session.projection().actionEligibility.discard, false);
  assert.equal(await h.session.invoke("discard"), false);
  assert.equal(await h.session.invoke("pause"), false);
  assert.equal(await h.session.invoke("accept"), true);
  assert.equal(h.session.projection().actionEligibility.pause, true);
  assert.deepEqual(
    h.requests.map((item) => item.options.method),
    ["GET"]
  );
  h.session.destroy();
});

test("an outstanding pre-action read cannot overwrite the authoritative Pause result", async () => {
  const state = {
    packageId: PACKAGE_ID,
    sourceDatasetName: "PRIMARY",
    paused: false,
    controlVersion: "AAAAAAAAAAE=",
    canPause: true,
    canResume: false,
    canDiscard: true,
    eligibleMembers: [],
  };
  let finishOldRead;
  let reads = 0;
  const session = createPackageActionSession({
    sourceName: "PRIMARY",
    identityKey: "identity",
    memberNames: {},
    demoEnabled: false,
    isCurrent: () => true,
    onChange: () => {},
    request: async (url) => {
      if (url.endsWith("/actions")) {
        reads++;
        if (reads === 1) return { success: true, data: state };
        return new Promise((done) => {
          finishOldRead = done;
        });
      }
      if (url.endsWith("/pause"))
        return {
          success: true,
          data: {
            packageId: PACKAGE_ID,
            paused: true,
            controlVersion: "AAAAAAAAAAI=",
          },
        };
      throw new Error(`Unexpected ${url}`);
    },
    notify: { success() {} },
  });
  await session.start();
  const staleRead = session.refresh();
  assert.equal(await session.invoke("pause"), true);
  finishOldRead({ success: true, data: state });
  assert.equal(await staleRead, false);
  assert.equal(session.projection().paused, true);
  assert.equal(session.projection().actionEligibility.resume, true);
  session.destroy();
});
