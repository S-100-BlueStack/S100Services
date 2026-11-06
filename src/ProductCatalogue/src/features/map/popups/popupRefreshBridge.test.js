import assert from "node:assert/strict";
import test from "node:test";

import {
  refreshOpenProductPopup,
  registerPopupRefreshHandler,
  registerPopupSourceStatusRefreshHandler,
  requestPopupSourceStatusRefresh,
} from "./popupRefreshBridge.js";

test("refreshOpenProductPopup refreshes only matching product popups", async () => {
  const calls = [];
  const removeFirst = registerPopupRefreshHandler({
    datasetName: "101DK0000001E",
    refresh: async (options) => {
      calls.push(["first", options]);
      return true;
    },
  });
  const removeSecond = registerPopupRefreshHandler({
    datasetName: "101DK0000002E",
    refresh: async () => {
      calls.push(["second"]);
      return true;
    },
  });

  try {
    const result = await refreshOpenProductPopup(" 101dk0000001e ", {
      showFailureNotice: false,
    });

    assert.deepEqual(result, {
      matched: 1,
      refreshed: 1,
    });
    assert.deepEqual(calls, [["first", { showFailureNotice: false }]]);
  } finally {
    removeFirst();
    removeSecond();
  }
});

test("removed popup refresh handlers are not called", async () => {
  let calls = 0;
  const remove = registerPopupRefreshHandler({
    datasetName: "101DK0000001E",
    refresh: async () => {
      calls += 1;
      return true;
    },
  });

  remove();

  const result = await refreshOpenProductPopup("101DK0000001E");

  assert.deepEqual(result, {
    matched: 0,
    refreshed: 0,
  });
  assert.equal(calls, 0);
});

test("one failing popup handler does not block other handlers", async () => {
  const removeFirst = registerPopupRefreshHandler({
    datasetName: "101DK0000001E",
    refresh: async () => {
      throw new Error("test failure");
    },
  });
  const removeSecond = registerPopupRefreshHandler({
    datasetName: "101DK0000001E",
    refresh: async () => true,
  });

  try {
    const result = await refreshOpenProductPopup("101DK0000001E");

    assert.deepEqual(result, {
      matched: 2,
      refreshed: 1,
    });
  } finally {
    removeFirst();
    removeSecond();
  }
});

test("popup drift bridge delegates to the active map owner and unregisters on teardown", async () => {
  const requests = [];
  const unregister = registerPopupSourceStatusRefreshHandler((observation) => {
    requests.push(observation);
    return { success: true };
  });
  try {
    assert.deepEqual(await requestPopupSourceStatusRefresh({ sourceId: "" }), []);
    const result = await requestPopupSourceStatusRefresh({
      sourceId: "s101",
      datasetName: "PRIMARY",
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "fulfilled");
    assert.deepEqual(requests, [{ sourceId: "s101", datasetName: "PRIMARY" }]);
  } finally {
    unregister();
  }
  assert.deepEqual(await requestPopupSourceStatusRefresh({ sourceId: "s101" }), []);
});

test("popup drift bridge contains callback failures", async () => {
  const unregister = registerPopupSourceStatusRefreshHandler(() => {
    throw new Error("owner destroyed");
  });
  try {
    const result = await requestPopupSourceStatusRefresh({ sourceId: "s101" });
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "rejected");
  } finally {
    unregister();
  }
});
