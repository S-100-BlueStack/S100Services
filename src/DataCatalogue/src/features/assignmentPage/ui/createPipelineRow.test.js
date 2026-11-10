import test from "node:test";
import assert from "node:assert/strict";
import { createPipelineRow } from "./createPipelineRow.js";
import { createAssignmentSession } from "../../assignments/state/createAssignmentSession.js";

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

function fakeDom() {
  const original = globalThis.document;
  class Node {
    constructor(tag) {
      this.tagName = tag;
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
    dispatch(event) {
      this.listeners.get(event)?.({ target: this });
    }
  }
  globalThis.document = { createElement: (tag) => new Node(tag) };
  return () => {
    globalThis.document = original;
  };
}

function createFixture() {
  const data = {
    A: { relations: { p: { active: true, workspaces: [{ id: "w1", name: "One" }] } } },
    B: { relations: { p: { active: true, workspaces: [{ id: "w2", name: "Two" }] } } },
  };
  const services = {
    source: "live",
    features: { get: async (id) => ({ id }) },
    assignments: { load: async (id) => structuredClone(data[id]) },
  };
  const session = createAssignmentSession({ services });
  return { session };
}

function nodes(row) {
  const [heading, commentEditor, derived, editor] = row.element.children;
  const [primary, comment] = heading.children;
  const [pipelineCheckbox] = primary.children;
  const [status, list, retry] = editor.children;
  const [commentInput, closeComment] = commentEditor.children;
  return {
    derived,
    editor,
    pipelineCheckbox,
    comment,
    commentEditor,
    commentInput,
    closeComment,
    status,
    list,
    retry,
  };
}

function checkboxAt(list, index) {
  return list.children[index].children[0];
}

const workspaceCatalogue = {
  items: [
    { id: "w1", name: "One", pipelineId: "p" },
    { id: "w2", name: "Two", pipelineId: "p" },
  ],
};

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("Pipeline Workspace checkboxes appear inline, auto-match and preview reversible choices", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session, {
      listWorkspaces: async () => workspaceCatalogue,
    });
    const { editor, list, derived, closeComment } = nodes(row);
    assert.equal(closeComment.textContent, "OK");
    const unsubscribe = session.subscribe(row.update);
    await flush();
    assert.equal(editor.hidden, false);
    assert.equal(list.children.length, 2);
    assert.equal(checkboxAt(list, 0).checked, true);
    assert.equal(checkboxAt(list, 1).checked, false);
    assert.equal(derived.textContent, "1 auto-matched workspaces");

    checkboxAt(list, 0).checked = false;
    checkboxAt(list, 0).dispatch("change");
    checkboxAt(list, 1).checked = true;
    checkboxAt(list, 1).dispatch("change");
    assert.deepEqual(session.snapshot().draft.workspaceOverrides, { p: { w1: false, w2: true } });
    assert.equal(await session.save(), false);

    checkboxAt(list, 0).checked = true;
    checkboxAt(list, 0).dispatch("change");
    checkboxAt(list, 1).checked = false;
    checkboxAt(list, 1).dispatch("change");
    assert.deepEqual(session.snapshot().draft.workspaceOverrides, {});
    unsubscribe();
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("Stale Pipeline Workspace list cannot appear for the next selected Package", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  const old = deferred();
  const newer = deferred();
  let reads = 0;
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session, {
      listWorkspaces: async () => (++reads === 1 ? old.promise : newer.promise),
    });
    const { list, editor } = nodes(row);
    const unsubscribe = session.subscribe(row.update);
    await session.select("B");
    old.resolve(workspaceCatalogue);
    await flush();
    assert.equal(list.children.length, 0);
    assert.equal(editor.hidden, false);
    newer.resolve(workspaceCatalogue);
    await flush();
    assert.equal(list.children.length, 2);
    unsubscribe();
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("Workspace list failures offer retry without changing a saved binding", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let attempts = 0;
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session, {
      listWorkspaces: async () => {
        if (++attempts === 1) throw new Error("Catalogue unavailable");
        return workspaceCatalogue;
      },
    });
    const { status, retry, list } = nodes(row);
    session.subscribe(row.update);
    await flush();
    assert.match(status.textContent, /Catalogue unavailable/);
    assert.equal(retry.hidden, false);
    retry.dispatch("click");
    await flush();
    assert.equal(retry.hidden, true);
    assert.equal(list.children.length, 2);
    assert.equal(session.snapshot().dirty, false);
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("Hidden inline Workspace rows retain draft choices until reselected", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session, {
      listWorkspaces: async () => workspaceCatalogue,
    });
    session.subscribe(row.update);
    const { pipelineCheckbox, editor, list } = nodes(row);
    await flush();
    const original = checkboxAt(list, 0);
    original.checked = false;
    original.dispatch("change");
    pipelineCheckbox.checked = false;
    pipelineCheckbox.dispatch("change");
    assert.equal(editor.hidden, true);
    assert.deepEqual(session.snapshot().draft.workspaceOverrides, { p: { w1: false } });
    pipelineCheckbox.checked = true;
    pipelineCheckbox.dispatch("change");
    assert.equal(editor.hidden, false);
    assert.equal(original.checked, false);
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});

test("Pipeline speech-bubble editor keeps a local comment and does not authorize live Save", async () => {
  const restore = fakeDom();
  const { session } = createFixture();
  let row;
  try {
    await session.select("A");
    row = createPipelineRow({ id: "p", name: "Pipeline" }, session, {
      listWorkspaces: async () => workspaceCatalogue,
    });
    session.subscribe(row.update);
    const { comment, commentInput, commentEditor, closeComment } = nodes(row);
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
  } finally {
    row?.destroy();
    session.destroy();
    restore();
  }
});
