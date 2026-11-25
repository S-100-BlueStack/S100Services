import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspacePopupTemplate } from "./workspacePopupContent.js";

function withDocument(callback) {
  const prior = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      const attributes = new Map();
      return {
        tagName,
        className: "",
        textContent: "",
        children: [],
        disabled: false,
        setAttribute(name, value) {
          attributes.set(name, String(value));
        },
        getAttribute(name) {
          return attributes.get(name) ?? null;
        },
        append(...nodes) {
          this.children.push(...nodes);
        },
      };
    },
  };
  try {
    return callback();
  } finally {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  }
}

function details(content) {
  return content.children[1].children[1].children.map((row) =>
    row.children.map((cell) => cell.textContent)
  );
}

test("native Workspace title owns the only header and close button", () => {
  withDocument(() => {
    const template = createWorkspacePopupTemplate();
    const graphic = { attributes: { workspaceName: "DK20149C", pipelineName: "ENC", openJobs: 5 } };
    const content = template.content({ graphic });
    assert.equal(template.title({ graphic }), "DK20149C");
    assert.deepEqual(template.actions, []);
    assert.equal(template.overwriteActions, true);
    assert.equal(content.className, "dc-workspace-popup");
    assert.deepEqual(
      content.children.map((child) => child.className),
      ["dc-workspace-popup__actions", "dc-workspace-popup__information"]
    );
    assert.equal(
      content.children.some((child) => child.tagName === "header"),
      false
    );
    assert.deepEqual(details(content), [
      ["Workstream", "ENC"],
      ["Open packages", "5"],
    ]);
  });
});

test("lock action is disabled and status is an explicit placeholder", () => {
  withDocument(() => {
    const content = createWorkspacePopupTemplate().content({
      graphic: { attributes: { workspaceName: "Example", lockOwner: "Unverified value" } },
    });
    const [take, owner] = content.children[0].children;
    assert.equal(take.tagName, "button");
    assert.equal(take.disabled, true);
    assert.equal(take.type, "button");
    assert.equal(take.children[0].getAttribute("icon"), "hammer-lock");
    assert.equal(take.children[1].textContent, "Take workspace");
    assert.equal(take.onclick, undefined);
    assert.equal(owner.children[0].getAttribute("icon"), "unlock");
    assert.equal(owner.children[1].textContent, "None");
    assert.match(owner.title, /not yet available/);
    assert.deepEqual(details(content), [["Workstream", "Unavailable"]]);
  });
});

test("missing counts are omitted instead of invented as zero", () => {
  withDocument(() => {
    for (const count of [null, undefined, -1, 2.5, "5", Number.MAX_SAFE_INTEGER + 1]) {
      const content = createWorkspacePopupTemplate().content({
        graphic: {
          attributes: { workspaceId: "workspace-1", pipelineId: "pipeline-1", openJobs: count },
        },
      });
      assert.deepEqual(details(content), [["Workstream", "pipeline-1"]]);
    }
    const content = createWorkspacePopupTemplate().content({
      graphic: { attributes: { openJobs: 0 } },
    });
    assert.deepEqual(details(content), [
      ["Workstream", "Unavailable"],
      ["Open packages", "0"],
    ]);
  });
});

test("backend names cannot inject markup into native title or app-owned content", () => {
  withDocument(() => {
    const name = '<img src="x" onerror="alert(1)">';
    const pipeline = "<script>bad()</script>";
    const graphic = { attributes: { workspaceName: name, pipelineName: pipeline, openJobs: 1 } };
    const template = createWorkspacePopupTemplate();
    assert.equal(
      template.title({ graphic }),
      "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;"
    );
    assert.deepEqual(details(template.content({ graphic })), [
      ["Workstream", pipeline],
      ["Open packages", "1"],
    ]);
  });
});

test("Workstream field label does not rewrite backend names or opaque identifiers", () => {
  withDocument(() => {
    const template = createWorkspacePopupTemplate();
    const attributes = {
      workspaceName: "Pipeline Survey Workspace",
      pipelineName: "Pipeline Survey",
      pipelineId: "Pipeline ID / 42",
    };
    assert.equal(template.title({ graphic: { attributes } }), "Pipeline Survey Workspace");
    assert.deepEqual(details(template.content({ graphic: { attributes } })), [
      ["Workstream", "Pipeline Survey"],
    ]);
    delete attributes.pipelineName;
    assert.deepEqual(details(template.content({ graphic: { attributes } })), [
      ["Workstream", "Pipeline ID / 42"],
    ]);
  });
});
