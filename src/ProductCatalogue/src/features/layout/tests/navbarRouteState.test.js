import assert from "node:assert/strict";
import test from "node:test";

import { applyNavbarRouteState, resolvePrimaryRouteName } from "../services/navbarRouteState.js";

class FakeLink {
  constructor(routeName) {
    this.dataset = { navRoute: routeName };
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function createNavbarRoot() {
  const links = ["main", "dashboard", "analyze", "review"].map(
    (routeName) => new FakeLink(routeName)
  );

  return {
    links,
    querySelectorAll() {
      return links;
    },
  };
}

for (const routeName of ["main", "dashboard", "analyze", "review"]) {
  test(`marks only the ${routeName} primary navigation link as current`, () => {
    const root = createNavbarRoot();

    applyNavbarRouteState(root, { name: routeName });

    const currentLinks = root.links.filter((link) => link.getAttribute("aria-current") === "page");
    assert.equal(currentLinks.length, 1);
    assert.equal(currentLinks[0].dataset.navRoute, routeName);
    assert.ok(
      root.links
        .filter((link) => link.dataset.navRoute !== routeName)
        .every((link) => link.getAttribute("aria-current") === null)
    );
  });
}

test("resolves the shared shell fallback as the Main-map route", () => {
  assert.equal(resolvePrimaryRouteName({ name: "unknown" }), "main");
  assert.equal(resolvePrimaryRouteName(null), "main");
});
