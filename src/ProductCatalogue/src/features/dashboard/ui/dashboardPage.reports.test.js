import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.events = new Map();
    this.open = false;
    this.isConnected = true;
    this.textContent = "";
  }
  append(...children) {
    this.children.push(...children);
  }
  appendChild(child) {
    this.append(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  addEventListener(name, handler) {
    this.events.set(name, handler);
  }
  trigger(name) {
    this.events.get(name)?.();
  }
}

async function createHarness(fetchReports = async () => ({ reports: [] })) {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  const notices = [];
  const result = runInNewContext(
    source
      .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
      .replace("export function", "function") + "\n({ createReportLinkGroup });",
    {
      Error,
      Promise,
      document: { createElement: (tag) => new Element(tag) },
      fetchDashboardValidationReports: fetchReports,
      createDefaultDashboardFilters: () => ({}),
      noticeError: (...args) => notices.push(args),
    }
  );
  return { ...result, notices };
}
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("Dashboard exposes every linked report rather than silently opening only the first", async () => {
  const h = await createHarness();
  const disclosure = h.createReportLinkGroup({
    label: "IC-ENC",
    datasetName: "Product A",
    reports: [
      { url: "/report/one", title: "One" },
      { url: "/report/two", title: "Two" },
    ],
  });
  disclosure.open = true;
  disclosure.trigger("toggle");
  await flush();
  const links = disclosure.children[1].children;
  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map((link) => link.href),
    ["/report/one", "/report/two"]
  );
  assert.ok(links.every((link) => link.rel === "noopener noreferrer"));
});

test("Dashboard retrieves Validation files only on open and renders all returned download links", async () => {
  const calls = [];
  const h = await createHarness(async (name) => {
    calls.push(name);
    return {
      reports: [
        { url: "/artifact/one", title: "Report one" },
        { url: "/artifact/two", title: "Report two" },
      ],
    };
  });
  const disclosure = h.createReportLinkGroup({
    label: "Validation",
    datasetName: "Product B",
    reports: [{ available: true, id: "report-1", url: null }],
  });
  assert.deepEqual(calls, []);
  disclosure.open = true;
  disclosure.trigger("toggle");
  await flush();
  assert.deepEqual(calls, ["Product B"]);
  assert.deepEqual(
    disclosure.children[1].children.map((link) => link.href),
    ["/artifact/one", "/artifact/two"]
  );
  disclosure.trigger("toggle");
  await flush();
  assert.equal(calls.length, 1, "Repeating an open must not duplicate the request");
});

test("Dashboard never resolves IC-ENC metadata through the Validation artifact API", async () => {
  let calls = 0;
  const h = await createHarness(async () => {
    calls++;
    return { reports: [] };
  });
  const button = h.createReportLinkGroup({
    label: "IC-ENC",
    datasetName: "Product C",
    reports: [{ id: "ic-enc-metadata", url: null }],
  });
  assert.equal(button.tagName, "button");
  button.trigger("click");
  assert.equal(calls, 0);
  assert.equal(h.notices.length, 1);
});

test("Dashboard ignores detached Validation downloads and allows retry on reopening", async () => {
  const pending = [];
  const h = await createHarness(() => new Promise((resolve) => pending.push(resolve)));
  const disclosure = h.createReportLinkGroup({
    label: "Validation",
    datasetName: "Product D",
    reports: [{ id: "report-id", url: null }],
  });
  disclosure.open = true;
  disclosure.trigger("toggle");
  await flush();
  disclosure.open = false;
  pending.shift()({ reports: [{ url: "/stale", title: "Stale" }] });
  await flush();
  assert.equal(disclosure.children[1].children.length, 0);
  disclosure.open = true;
  disclosure.trigger("toggle");
  await flush();
  assert.equal(pending.length, 1);
  pending.shift()({ reports: [{ url: "/current", title: "Current" }] });
  await flush();
  assert.equal(disclosure.children[1].children[0].href, "/current");
});
