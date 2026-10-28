import assert from "node:assert/strict";
import test from "node:test";

import { addNotice } from "../state/noticeStore.js";
import { initNoticePanel } from "./noticePanel.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.children = [];
    this._textContent = "";
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }

  set innerHTML(_value) {
    throw new Error("Notice rendering must not assign innerHTML.");
  }

  appendChild(child) {
    this._textContent = "";
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this._textContent = "";
    this.children = [];

    for (const child of children) {
      this.appendChild(child);
    }
  }
}

function createTimestamp(value) {
  return {
    toLocaleTimeString: () => value,
  };
}

function getNoticeParts(row) {
  const [type, content, time] = row.children;
  const [title, message] = content.children;

  return { type, content, title, message, time };
}

function collectTagNames(element) {
  return [element.tagName, ...element.children.flatMap(collectTagNames)];
}

function findRowByTitle(container, title) {
  return container.children.find((row) => getNoticeParts(row).title.textContent === title);
}

test("renders persistent notices safely without changing their presentation", async (context) => {
  const previousDocument = globalThis.document;
  const container = new FakeElement("div");

  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => (id === "notice-log" ? container : null),
  };

  try {
    initNoticePanel();

    await context.test("renders HTML-like values as literal text", () => {
      const title = '<img src="x" onerror="globalThis.__pc004Injected = true">';
      const message = '<button onclick="globalThis.__pc004Injected = true">Run action</button>';

      addNotice({
        type: "danger",
        title,
        message,
        timestamp: createTimestamp("13:45:00"),
      });

      const row = findRowByTitle(container, title);
      const parts = getNoticeParts(row);
      const tagNames = collectTagNames(row);

      assert.equal(parts.title.textContent, title);
      assert.equal(parts.message.textContent, message);
      assert.deepEqual(tagNames, ["DIV", "SPAN", "SPAN", "DIV", "DIV", "SPAN"]);
      assert.equal(tagNames.includes("IMG"), false);
      assert.equal(tagNames.includes("BUTTON"), false);
      assert.equal(globalThis.__pc004Injected, undefined);
    });

    await context.test("preserves notice variants, icons, content, and timestamps", () => {
      const variants = [
        { type: "success", icon: "✔" },
        { type: "danger", icon: "✖" },
        { type: "warning", icon: "⚠" },
        { type: "info", icon: "ℹ" },
      ];

      for (const variant of variants) {
        addNotice({
          type: variant.type,
          title: `${variant.type} title`,
          message: `${variant.type} message`,
          timestamp: createTimestamp(`${variant.type} time`),
        });
      }

      for (const variant of variants) {
        const row = findRowByTitle(container, `${variant.type} title`);
        const parts = getNoticeParts(row);

        assert.equal(row.className, `notice-row notice-${variant.type}`);
        assert.equal(parts.type.className, "notice-type");
        assert.equal(parts.type.textContent, variant.icon);
        assert.equal(parts.content.className, "notice-content");
        assert.equal(parts.title.className, "notice-title");
        assert.equal(parts.title.textContent, `${variant.type} title`);
        assert.equal(parts.message.className, "notice-message");
        assert.equal(parts.message.textContent, `${variant.type} message`);
        assert.equal(parts.time.className, "notice-time");
        assert.equal(parts.time.textContent, `${variant.type} time`);
      }
    });

    await context.test("replaces rendered rows and omits an empty message element", () => {
      const previousRows = [...container.children];

      addNotice({
        type: "info",
        title: "Notice without message",
        message: "",
        timestamp: createTimestamp("empty-message time"),
      });

      const row = findRowByTitle(container, "Notice without message");
      const parts = getNoticeParts(row);

      assert.equal(previousRows.includes(row), false);
      assert.equal(container.children.length, previousRows.length + 1);
      assert.equal(parts.content.children.length, 1);
      assert.equal(parts.message, undefined);
      assert.equal(parts.time.textContent, "empty-message time");
    });
  } finally {
    delete globalThis.__pc004Injected;

    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});
