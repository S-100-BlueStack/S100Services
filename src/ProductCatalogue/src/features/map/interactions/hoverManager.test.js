import assert from "node:assert/strict";
import test from "node:test";
import { createHoverManager } from "./hoverManager.js";

test("a stale asynchronous hover result cannot replace the newest hover candidate", async () => {
  const frames = [];
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const firstHit = createDeferred();
    const secondHit = createDeferred();
    const layer = { visible: true };
    const first = createGraphic(layer, "first");
    const second = createGraphic(layer, "second");
    const view = createView([firstHit.promise, secondHit.promise]);
    const hoverManager = createHoverManager(view);
    await hoverManager.registerLayer(layer);

    view.emit("pointer-move", { x: 1, y: 1 });
    frames.shift()();
    view.emit("pointer-move", { x: 2, y: 2 });
    frames.shift()();

    secondHit.resolve({ results: [{ graphic: second }] });
    await flushPromises();
    firstHit.resolve({ results: [{ graphic: first }] });
    await flushPromises();

    assert.equal(
      hoverManager.getHighlightedGraphicIdentity(),
      `product:${second.attributes.productIdentityKey}`
    );
    assert.deepEqual(view.highlighted, [second]);
    hoverManager.destroy();
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("pointer leave clears transient identity and invalidates an in-flight hit test", async () => {
  const frames = [];
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const pendingHit = createDeferred();
    const layer = { visible: true };
    const graphic = createGraphic(layer, "late");
    const view = createView([pendingHit.promise]);
    const hoverManager = createHoverManager(view);
    await hoverManager.registerLayer(layer);

    view.emit("pointer-move", { x: 1, y: 1 });
    frames.shift()();
    view.emit("pointer-leave", {});
    pendingHit.resolve({ results: [{ graphic }] });
    await flushPromises();

    assert.equal(hoverManager.getHighlightedGraphicIdentity(), null);
    assert.deepEqual(view.highlighted, []);
    hoverManager.destroy();
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("popup-locked highlight is not exposed as a transient hover candidate", async () => {
  const layer = { visible: true };
  const graphic = createGraphic(layer, "selected");
  const view = createView([]);
  const hoverManager = createHoverManager(view);
  await hoverManager.registerLayer(layer);

  hoverManager.setLockedFeature(graphic);

  assert.equal(hoverManager.getHighlightedGraphicIdentity(), null);
  assert.deepEqual(view.highlighted, [graphic]);
  hoverManager.destroy();
});

test("transient highlight subscriptions clear when popup locking takes ownership", async () => {
  const frames = [];
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const layer = { visible: true };
    const graphic = createGraphic(layer, "selected-after-hover");
    const view = createView([Promise.resolve({ results: [{ graphic }] })]);
    const hoverManager = createHoverManager(view);
    const identities = [];
    await hoverManager.registerLayer(layer);
    const unsubscribe = hoverManager.subscribeHighlightedGraphicIdentity((identity) => {
      identities.push(identity);
    });

    view.emit("pointer-move", { x: 1, y: 1 });
    frames.shift()();
    await flushPromises();

    assert.equal(identities.at(-1), `product:${graphic.attributes.productIdentityKey}`);

    hoverManager.setLockedFeature(graphic);

    assert.equal(hoverManager.getHighlightedGraphicIdentity(), null);
    assert.equal(identities.at(-1), null);

    unsubscribe();
    hoverManager.destroy();
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

function createView(hitTestResults) {
  const handlers = new Map();
  const highlighted = [];

  return {
    highlighted,
    on(type, handler) {
      handlers.set(type, handler);
      return {
        remove() {
          handlers.delete(type);
        },
      };
    },
    emit(type, event) {
      handlers.get(type)?.(event);
    },
    async whenLayerView() {
      return {
        highlight(graphic) {
          highlighted.push(graphic);
          return {
            remove() {
              const index = highlighted.indexOf(graphic);
              if (index >= 0) highlighted.splice(index, 1);
            },
          };
        },
      };
    },
    hitTest() {
      return hitTestResults.shift();
    },
  };
}

function createGraphic(layer, productKey) {
  return {
    uid: productKey,
    visible: true,
    layer,
    attributes: {
      featureKey: productKey,
      productIdentityKey: JSON.stringify(["source", productKey]),
    },
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
