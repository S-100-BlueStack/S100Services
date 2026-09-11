import assert from "node:assert/strict";
import test from "node:test";

import { createActionConfigSignature } from "./popupActionConfigSignature.js";

test("action signature ignores recreated click handlers when visible state is unchanged", () => {
  const first = createActionConfigSignature({
    id: "rollback",
    label: "Cancel Export",
    icon: "x-circle",
    disabled: false,
    onClick: () => "first",
  });
  const second = createActionConfigSignature({
    id: "rollback",
    label: "Cancel Export",
    icon: "x-circle",
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

test("action signature changes when presentation help changes", () => {
  const generic = createActionConfigSignature({
    id: "export",
    label: "Export...",
    helpText: "Open export actions.",
    items: [{ id: "export-edition", label: "Edition", helpText: "Export Edition." }],
  });
  const s101 = createActionConfigSignature({
    id: "export",
    label: "Export...",
    helpText: "Open S-101 export actions.",
    items: [
      {
        id: "export-edition",
        label: "Edition",
        helpText: "Export a new S-101 Edition for this product.",
      },
    ],
  });

  assert.notEqual(generic, s101);
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

test("action signature tracks icon-only accessible presentation", () => {
  const textTools = createActionConfigSignature({
    id: "tools",
    label: "Tools",
    ariaLabel: "Tools",
    icon: "wrench",
    textEnabled: true,
  });
  const iconOnlyTools = createActionConfigSignature({
    id: "tools",
    label: "Tools",
    ariaLabel: "Tools",
    icon: "wrench",
    textEnabled: false,
  });

  assert.notEqual(textTools, iconOnlyTools);
});
