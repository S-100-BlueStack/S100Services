import assert from "node:assert/strict";
import test from "node:test";

import { createActionConfigSignature } from "./popupActionConfigSignature.js";

test("action signature ignores recreated click handlers when visible state is unchanged", () => {
  const first = createActionConfigSignature({
    id: "rollback",
    label: "Rollback",
    icon: "undo",
    disabled: false,
    onClick: () => "first",
  });
  const second = createActionConfigSignature({
    id: "rollback",
    label: "Rollback",
    icon: "undo",
    disabled: false,
    onClick: () => "second",
  });

  assert.equal(first, second);
});

test("action signature changes when loading or availability changes", () => {
  const available = createActionConfigSignature({
    id: "export",
    label: "Export...",
    icon: "plus-square",
    loading: false,
    disabled: false,
  });
  const running = createActionConfigSignature({
    id: "export",
    label: "Exporting...",
    icon: "plus-square",
    loading: true,
    disabled: true,
    disabledReason: "An export is already running.",
  });

  assert.notEqual(available, running);
});

test("action signature includes nested dropdown state", () => {
  const idle = createActionConfigSignature({
    id: "export",
    label: "Export...",
    items: [
      {
        id: "s100-edition",
        label: "Edition",
        disabled: false,
      },
    ],
  });
  const running = createActionConfigSignature({
    id: "export",
    label: "Exporting...",
    items: [
      {
        id: "s100-edition",
        label: "Exporting...",
        loading: true,
        disabled: true,
      },
    ],
  });

  assert.notEqual(idle, running);
});
