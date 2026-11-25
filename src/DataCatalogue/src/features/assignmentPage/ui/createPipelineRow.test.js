import test from "node:test";
import assert from "node:assert/strict";
import { createPipelineRow } from "./createPipelineRow.js";
import { createAssignmentSession } from "../../assignments/state/createAssignmentSession.js";

function fakeDom() {
  const original = globalThis.document;
  class Node {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.listeners = new Map();
      this.attributes = new Map();
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
      this.className = "";
      this.textContent = "";
      this.classList = { toggle: () => {} };
    }
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.children = [...children];
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.get(name);
    }
    addEventListener(event, handler) {
      this.listeners.set(event, handler);
    }
    dispatch(event, details = {}) {
      this.listeners.get(event)?.({ target: this, preventDefault() {}, ...details });
    }
  }
  globalThis.document = { createElement: (tag) => new Node(tag) };
  return () => {
    globalThis.document = original;
  };
}

function createFixture() {
  const data = {
    A: {
      relations: {
        p: {
          active: true,
          workspaces: [
            { id: "w2", name: "Zulu" },
            { id: "w1", name: "Alpha" },
          ],
        },
      },
    },
    B: { relations: { p: { active: true, workspaces: [{ id: "w3", name: "Kattegat" }] } } },
    C: { relations: { p: { active: true, workspaces: [] } } },
    D: { relations: {} },
  };
  const services = {
    source: "live",
    features: { get: async (id) => ({ id }) },
    assignments: {
      load: async (id) => structuredClone(data[id]),
      save: async (id) => {
        assert.equal(id, "D");
        return {
          relations: {
            p: { active: true, workspaces: [{ id: "w4", name: "New match" }] },
          },
        };
      },
    },
  };
  const session = createAssignmentSession({ services });
  return { session };
}

function nodes(row) {
  const [heading, commentEditor, matches] = row.element.children;
  const [primary, comment] = heading.children;
  const [pipelineCheckbox] = primary.children;
  const [status, list] = matches.children;
  const [commentInput, closeComment] = commentEditor.children;
  return {
    matches,
    pipelineCheckbox,
    comment,
    commentEditor,
    commentInput,
    closeComment,
    status,
    list,
  };
}

test("Pipeline shows only saved automatic Workspace names as a read-only list", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session);
    session.subscribe(row.update);
    const { matches, pipelineCheckbox, list, status, closeComment } = nodes(row);
    assert.equal(matches.hidden, false);
    assert.equal(
      matches.getAttribute("aria-label"),
      "Automatically matched Workspaces for Pipeline"
    );
    assert.equal(list.tagName, "UL");
    assert.deepEqual(
      list.children.map((item) => item.textContent),
      ["Alpha", "Zulu"]
    );
    assert.ok(list.children.every((item) => item.tagName === "LI"));
    assert.equal(
      list.children.some((item) => item.children.length),
      false
    );
    assert.equal(status.textContent, "2 auto-matched Workspaces");
    assert.equal(pipelineCheckbox.checked, true);
    assert.equal(closeComment.textContent, "OK");
    assert.equal(session.snapshot().dirty, false);
    assert.deepEqual(Object.keys(session.snapshot().draft).sort(), ["activeIds", "comments"]);
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("Package switch replaces saved Workspace matches without another read", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session);
    session.subscribe(row.update);
    const { matches, list, status } = nodes(row);
    assert.equal(list.children.length, 2);
    assert.equal(await session.select("B"), true);
    assert.equal(matches.hidden, false);
    assert.deepEqual(
      list.children.map((item) => item.textContent),
      ["Kattegat"]
    );
    assert.equal(status.textContent, "1 auto-matched Workspace");
    assert.equal(await session.select("C"), true);
    assert.deepEqual(list.children, []);
    assert.equal(status.textContent, "No auto-matched Workspaces.");
    assert.equal(await session.select("D"), true);
    assert.equal(matches.hidden, true);
    assert.deepEqual(list.children, []);
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("New Pipeline draft does not invent Workspace matches", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("D");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session);
    session.subscribe(row.update);
    const { pipelineCheckbox, matches, list, status } = nodes(row);
    assert.equal(matches.hidden, true);
    pipelineCheckbox.checked = true;
    pipelineCheckbox.dispatch("change");
    assert.equal(matches.hidden, false);
    assert.equal(status.textContent, "Workspace matches are calculated after Save.");
    assert.equal(list.children.length, 0);
    assert.equal(session.snapshot().dirty, true);
    assert.deepEqual(session.snapshot().record.relations, {});
    pipelineCheckbox.checked = false;
    pipelineCheckbox.dispatch("change");
    assert.equal(matches.hidden, true);
    assert.equal(session.snapshot().dirty, false);
    pipelineCheckbox.checked = true;
    pipelineCheckbox.dispatch("change");
    assert.equal(await session.save(), true);
    assert.equal(status.textContent, "1 auto-matched Workspace");
    assert.deepEqual(
      list.children.map((item) => item.textContent),
      ["New match"]
    );
    assert.equal(session.snapshot().dirty, false);
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("Removing a Pipeline draft never edits saved Workspace membership", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session);
    session.subscribe(row.update);
    const { pipelineCheckbox, matches, list } = nodes(row);
    pipelineCheckbox.checked = false;
    pipelineCheckbox.dispatch("change");
    assert.equal(matches.hidden, true);
    assert.equal(session.snapshot().dirty, true);
    assert.equal(session.snapshot().record.relations.p.workspaces.length, 2);
    pipelineCheckbox.checked = true;
    pipelineCheckbox.dispatch("change");
    assert.equal(matches.hidden, false);
    assert.deepEqual(
      list.children.map((item) => item.textContent),
      ["Alpha", "Zulu"]
    );
    assert.equal(session.snapshot().dirty, false);
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("Pipeline comment editor preserves local draft and blocks unsupported live Save", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session);
    session.subscribe(row.update);
    const { comment, commentInput, commentEditor, closeComment, list } = nodes(row);
    assert.equal(comment.children[0].icon, "speech-bubble");
    comment.dispatch("click");
    assert.equal(commentEditor.hidden, false);
    commentInput.value = "Review survey notes";
    commentInput.dispatch("input");
    assert.equal(session.snapshot().draft.comments[0].text, "Review survey notes");
    assert.match(session.snapshot().validationError, /draft-only/);
    assert.equal(await session.save(), false);
    closeComment.dispatch("click");
    assert.equal(commentEditor.hidden, true);
    comment.dispatch("click");
    commentInput.value = "";
    commentInput.dispatch("input");
    assert.deepEqual(session.snapshot().draft.comments, []);
    assert.equal(session.snapshot().validationError, "");
    assert.equal(list.children.length, 2);
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("An inactive Workstream exposes immutable plain-text comments in the existing editor", () => {
  const restore = fakeDom();
  const row = createPipelineRow({ id: "p", name: "ENC" }, {});
  try {
    const text = "<img src=x onerror=alert(1)>\nPlain text";
    row.update({
      feature: { id: "package" },
      record: { relations: {} },
      draft: { activeIds: [], comments: [] },
      commentHistory: {
        byPipeline: {
          p: [
            { id: "comment", text, actor: "PROD\\B123456", occurredAtUtc: "2026-11-25T13:00:00Z" },
          ],
        },
      },
    });
    const { comment, commentEditor, commentInput } = nodes(row);
    assert.equal(comment.disabled, false);
    comment.dispatch("click");
    assert.equal(commentInput.hidden, true);
    assert.equal(commentInput.readOnly, true);
    const [list] = commentEditor.children.at(-1).children;
    const [header, savedText] = list.children[0].children;
    assert.match(header.children[1].textContent, /UTC$/);
    assert.equal(savedText.textContent, text);
    assert.equal(savedText.children.length, 0);
    commentEditor.dispatch("keydown", { key: "Escape" });
    assert.equal(commentEditor.hidden, true);
  } finally {
    row.destroy();
    restore();
  }
});
