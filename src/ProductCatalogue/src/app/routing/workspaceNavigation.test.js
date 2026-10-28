import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWorkspaceLinkNavigation,
  launchWorkspaceUrl,
  resolveWorkspaceNavigationMode,
  workspaceNavigationModes,
} from "./workspaceNavigation.js";

const workspaceRoutes = ["dashboard", "analyze", "review"];

test("Main launches every primary workspace in a new tab", () => {
  for (const destinationRoute of workspaceRoutes) {
    assert.equal(
      resolveWorkspaceNavigationMode({ name: "main" }, destinationRoute),
      workspaceNavigationModes.newTab
    );
  }
});

test("launch policy resolves the current Main route through the established route helper", (t) => {
  const previousWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    location: new URL("https://catalogue.example/"),
  };
  t.after(() => {
    globalThis.window = previousWindow;
  });

  const result = launchWorkspaceUrl("/dashboard/", "dashboard", {
    openWindow(url, target) {
      calls.push({ url, target });
      return { opener: null };
    },
  });

  assert.deepEqual(calls, [{ url: "/dashboard/", target: "_blank" }]);
  assert.deepEqual(result, { mode: workspaceNavigationModes.newTab, opened: true });
});

test("workspace-to-workspace primary navigation remains in the same tab", () => {
  for (const currentRoute of workspaceRoutes) {
    for (const destinationRoute of workspaceRoutes) {
      assert.equal(
        resolveWorkspaceNavigationMode({ name: currentRoute }, destinationRoute),
        workspaceNavigationModes.sameTab
      );
    }
  }
});

test("link policy retains href semantics and scopes new-tab attributes to Main", () => {
  const link = createLink("/catalogue/Analyze?Datasets=");

  applyWorkspaceLinkNavigation(link, { name: "main" }, "analyze");
  assert.equal(link.href, "/catalogue/Analyze?Datasets=");
  assert.equal(link.target, "_blank");
  assert.equal(link.rel, "noopener noreferrer");

  applyWorkspaceLinkNavigation(link, { name: "review" }, "analyze");
  assert.equal(link.href, "/catalogue/Analyze?Datasets=");
  assert.equal(link.target, undefined);
  assert.equal(link.rel, undefined);
});

test("successful new-tab launch uses the canonical URL and detaches its opener", () => {
  const calls = [];
  const openedWindow = { opener: {} };
  const result = launchWorkspaceUrl("/catalogue/Analyze?Datasets=A%26B%2CC%2BD", "analyze", {
    currentRoute: { name: "main" },
    openWindow(url, target) {
      calls.push({ url, target });
      return openedWindow;
    },
  });

  assert.deepEqual(calls, [{ url: "/catalogue/Analyze?Datasets=A%26B%2CC%2BD", target: "_blank" }]);
  assert.equal(openedWindow.opener, null);
  assert.deepEqual(result, { mode: workspaceNavigationModes.newTab, opened: true });
});

test("null and thrown new-tab attempts report failure without same-tab fallback", () => {
  let sameTabCalls = 0;
  const options = {
    currentRoute: { name: "main" },
    navigateSameTab() {
      sameTabCalls += 1;
    },
  };

  assert.deepEqual(
    launchWorkspaceUrl("/dashboard/", "dashboard", {
      ...options,
      openWindow: () => null,
    }),
    { mode: workspaceNavigationModes.newTab, opened: false }
  );

  const error = new Error("open failed");
  assert.deepEqual(
    launchWorkspaceUrl("/Review?Datasets=A", "review", {
      ...options,
      openWindow() {
        throw error;
      },
    }),
    { mode: workspaceNavigationModes.newTab, opened: false, error }
  );
  assert.equal(sameTabCalls, 0);
});

test("workspace navigation uses same-tab assignment without attempting a popup", () => {
  const calls = [];
  const result = launchWorkspaceUrl("/catalogue/Review?Datasets=A", "review", {
    currentRoute: { name: "analyze" },
    openWindow() {
      throw new Error("new-tab open must not run");
    },
    navigateSameTab(url) {
      calls.push(url);
    },
  });

  assert.deepEqual(calls, ["/catalogue/Review?Datasets=A"]);
  assert.deepEqual(result, { mode: workspaceNavigationModes.sameTab, opened: true });
});

function createLink(href) {
  return {
    href,
    target: undefined,
    rel: undefined,
    removeAttribute(name) {
      this[name] = undefined;
    },
  };
}
