import assert from "node:assert/strict";
import test from "node:test";
import { bindOverlapPicker } from "./overlapPicker.js";

test("map clicks and direct-selection keyboard actions retire pending Product search navigation", async () => {
  const handlers = new Map();
  let cancellations = 0;
  let popupCloses = 0;
  const view = {
    popup: {
      close() {
        popupCloses += 1;
      },
    },
    on(name, callback) {
      handlers.set(name, callback);
      return {
        remove() {
          handlers.delete(name);
        },
      };
    },
  };

  const cleanup = bindOverlapPicker(view, {
    onInteractionStart: () => {
      cancellations += 1;
    },
  });

  try {
    handlers.get("click")({ mapPoint: {} });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancellations, 1);
    assert.equal(popupCloses, 1);

    handlers.get("key-down")({ key: "Enter", native: { ctrlKey: true } });
    assert.equal(cancellations, 2);
    handlers.get("key-down")({ key: "Escape", native: { ctrlKey: false } });
    assert.equal(cancellations, 2);
  } finally {
    cleanup();
  }

  assert.equal(handlers.size, 0);
});
