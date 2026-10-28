import assert from "node:assert/strict";
import test from "node:test";
import {
  bindProductKeyboardActivation,
  createProductClickSession,
  getValidUniqueClickCandidates,
  handleProductClick,
  handleProductKeyboardActivation,
  resolveProductClickDecision,
} from "./productClickInteraction.js";

test("normal click with multiple Products keeps the overlap picker", async () => {
  const first = createGraphic("s57", "P001");
  const second = createGraphic("s101", "P001");
  const interaction = createInteraction({ graphics: [first, second] });

  const decision = await handleProductClick(interaction.options);

  assert.equal(decision.type, "overlap");
  assert.equal(interaction.overlaps.length, 1);
  assert.deepEqual(interaction.opened, []);
});

test("normal click with one Product opens the normal Product popup", async () => {
  const graphic = createGraphic("s57", "P001");
  const interaction = createInteraction({ graphics: [graphic] });

  const decision = await handleProductClick(interaction.options);

  assert.equal(decision.type, "graphic");
  assert.equal(interaction.opened[0].graphic, graphic);
  assert.deepEqual(interaction.overlaps, []);
});

for (const modifier of ["ctrlKey", "metaKey"]) {
  test(`${modifier} direct-selects the highlighted current candidate`, async () => {
    const first = createGraphic("s57", "P001");
    const highlighted = createGraphic("s101", "P001");
    const interaction = createInteraction({
      event: createEvent({ [modifier]: true }),
      graphics: [first, highlighted],
      highlightedIdentity: getIdentity(highlighted),
    });

    const decision = await handleProductClick(interaction.options);

    assert.equal(decision.reason, "highlighted-modifier-selection");
    assert.equal(interaction.opened[0].graphic, highlighted);
    assert.deepEqual(interaction.overlaps, []);
  });
}

test("direct selection uses identity instead of hit-test ordering", () => {
  const highlighted = createGraphic("paper-charts", "P002");
  const firstHit = createGraphic("s102", "P002");

  const decision = resolveProductClickDecision({
    event: createEvent({ ctrlKey: true }),
    graphics: [firstHit, highlighted],
    highlightedIdentity: getIdentity(highlighted),
  });

  assert.equal(decision.graphic, highlighted);
});

test("direct selection resolves a replacement Graphic with the same stable identity", () => {
  const staleHoverGraphic = createGraphic("s57", "P001");
  const replacement = createGraphic("s57", "P001");

  const decision = resolveProductClickDecision({
    event: createEvent({ ctrlKey: true }),
    graphics: [createGraphic("s101", "P001"), replacement],
    highlightedIdentity: getIdentity(staleHoverGraphic),
  });

  assert.notEqual(replacement, staleHoverGraphic);
  assert.equal(decision.graphic, replacement);
});

test("coincident sources follow the highlighted identity without source preference", () => {
  const s57 = createGraphic("s57", "SAME");
  const s101 = createGraphic("s101", "SAME");

  const s57Decision = resolveProductClickDecision({
    event: createEvent({ ctrlKey: true }),
    graphics: [s101, s57],
    highlightedIdentity: getIdentity(s57),
  });
  const s101Decision = resolveProductClickDecision({
    event: createEvent({ ctrlKey: true }),
    graphics: [s57, s101],
    highlightedIdentity: getIdentity(s101),
  });

  assert.equal(s57Decision.graphic, s57);
  assert.equal(s101Decision.graphic, s101);
});

test("modifier-click without a highlight falls back to normal overlap behavior", async () => {
  const interaction = createInteraction({
    event: createEvent({ ctrlKey: true }),
    graphics: [createGraphic("s57", "P001"), createGraphic("s101", "P001")],
  });

  const decision = await handleProductClick(interaction.options);

  assert.equal(decision.type, "overlap");
  assert.equal(interaction.overlaps.length, 1);
});

test("highlight absent from current candidates cannot be selected directly", async () => {
  const stale = createGraphic("s57", "STALE");
  const current = [createGraphic("s57", "A"), createGraphic("s101", "B")];
  const interaction = createInteraction({
    event: createEvent({ metaKey: true }),
    graphics: current,
    highlightedIdentity: getIdentity(stale),
  });

  const decision = await handleProductClick(interaction.options);

  assert.equal(decision.type, "overlap");
  assert.equal(interaction.opened.length, 0);
});

test("hover identity is captured before asynchronous click hit testing", async () => {
  const beforeClick = createGraphic("s57", "A");
  const lateHover = createGraphic("s101", "B");
  const hitTest = createDeferred();
  let highlightedIdentity = getIdentity(beforeClick);
  const interaction = createInteraction({
    event: createEvent({ ctrlKey: true }),
    graphics: [lateHover, createGraphic("paper-charts", "C")],
    highlightedIdentity: () => highlightedIdentity,
    hitTestPromise: hitTest.promise,
  });

  const pendingDecision = handleProductClick(interaction.options);
  highlightedIdentity = getIdentity(lateHover);
  hitTest.resolve({ results: interaction.results });

  const decision = await pendingDecision;
  assert.equal(decision.type, "overlap");
  assert.equal(interaction.opened.length, 0);
});

test("hidden candidates stay excluded from modifier selection", () => {
  const visible = createGraphic("s57", "A");
  const hiddenGraphic = createGraphic("s101", "B", { visible: false });
  const hiddenLayer = createGraphic("paper-charts", "C", { layerVisible: false });

  const candidates = getValidUniqueClickCandidates([
    { graphic: hiddenGraphic },
    { graphic: visible },
    { graphic: hiddenLayer },
  ]);
  const decision = resolveProductClickDecision({
    event: createEvent({ ctrlKey: true }),
    graphics: candidates,
    highlightedIdentity: getIdentity(hiddenGraphic),
  });

  assert.deepEqual(candidates, [visible]);
  assert.equal(decision.graphic, visible);
  assert.equal(decision.reason, "single-candidate");
});

test("inactive layers are excluded through the same interactive-layer hit test", async () => {
  const activeLayer = createLayer("active");
  const inactiveLayer = { id: "inactive" };
  const graphic = createGraphic("s57", "A", { layer: activeLayer });
  const interaction = createInteraction({
    event: createEvent({ ctrlKey: true }),
    graphics: [graphic],
    interactiveLayers: [activeLayer],
  });

  await handleProductClick(interaction.options);

  assert.deepEqual(interaction.hitTestOptions.include, [activeLayer]);
  assert.equal(interaction.hitTestOptions.include.includes(inactiveLayer), false);
});

test("a source deactivated while hitTest is pending cannot publish its stale Product", async () => {
  const graphic = createGraphic("s57", "A");
  const hitTest = createDeferred();
  let currentLayers = [graphic.layer];
  const interaction = createInteraction({
    graphics: [graphic],
    hitTestPromise: hitTest.promise,
    interactiveLayers: () => currentLayers,
  });

  const pendingDecision = handleProductClick(interaction.options);
  currentLayers = [];
  hitTest.resolve({ results: interaction.results });

  const decision = await pendingDecision;
  assert.equal(decision.type, "none");
  assert.equal(interaction.opened.length, 0);
  assert.equal(interaction.closed, 1);
});

test("same-layer reconciliation removal rejects the old hit Graphic", async () => {
  const graphic = createGraphic("s57", "A");
  const hitTest = createDeferred();
  const interaction = createInteraction({
    graphics: [graphic],
    hitTestPromise: hitTest.promise,
  });

  const pendingDecision = handleProductClick(interaction.options);
  graphic.layer._index.delete(graphic.attributes.featureKey);
  graphic.layer.graphics = [];
  hitTest.resolve({ results: interaction.results });

  const decision = await pendingDecision;
  assert.equal(decision.type, "none");
  assert.equal(interaction.opened.length, 0);
  assert.equal(interaction.closed, 1);
});

test("a current retained-layer Graphic still opens normally", async () => {
  const graphic = createGraphic("s57", "A");
  const interaction = createInteraction({ graphics: [graphic] });

  const decision = await handleProductClick(interaction.options);

  assert.equal(decision.type, "graphic");
  assert.equal(interaction.opened[0].graphic, graphic);
});

test("an older click cannot publish after a newer click", async () => {
  const session = createProductClickSession();
  const firstHit = createDeferred();
  const first = createInteraction({
    graphics: [createGraphic("s57", "old")],
    hitTestPromise: firstHit.promise,
    isCurrent: session.begin(),
  });
  const firstDecision = handleProductClick(first.options);

  const second = createInteraction({
    graphics: [createGraphic("s101", "new")],
    isCurrent: session.begin(),
  });
  const secondDecision = await handleProductClick(second.options);
  firstHit.resolve({ results: first.results });

  assert.equal(secondDecision.type, "graphic");
  assert.equal(second.opened.length, 1);
  assert.equal((await firstDecision).type, "stale");
  assert.equal(first.opened.length, 0);
});

test("an in-flight click cannot publish after interaction teardown", async () => {
  const session = createProductClickSession();
  const hitTest = createDeferred();
  const interaction = createInteraction({
    graphics: [createGraphic("s57", "A")],
    hitTestPromise: hitTest.promise,
    isCurrent: session.begin(),
  });

  const pendingDecision = handleProductClick(interaction.options);
  session.destroy();
  hitTest.resolve({ results: interaction.results });

  assert.equal((await pendingDecision).type, "stale");
  assert.equal(interaction.opened.length, 0);
  assert.equal(interaction.closed, 0);
});

test("Shift-click does not invoke direct-selection semantics", async () => {
  const highlighted = createGraphic("s57", "A");
  const interaction = createInteraction({
    event: createEvent({ ctrlKey: true, shiftKey: true }),
    graphics: [highlighted, createGraphic("s101", "B")],
    highlightedIdentity: getIdentity(highlighted),
  });

  const decision = await handleProductClick(interaction.options);

  assert.equal(decision.type, "overlap");
  assert.equal(interaction.overlaps.length, 1);
});

test("Ctrl/Cmd+Enter opens exactly the current highlighted Product", () => {
  for (const modifier of ["ctrlKey", "metaKey"]) {
    const first = createGraphic("s57", `first-${modifier}`);
    const highlighted = createGraphic("s101", `highlighted-${modifier}`);
    const opened = [];

    const decision = handleProductKeyboardActivation({
      event: createKeyboardEvent({ [modifier]: true }),
      getInteractiveLayers: () => [first.layer, highlighted.layer],
      getHighlightedIdentity: () => getIdentity(highlighted),
      openGraphic: (options) => opened.push(options),
    });

    assert.equal(decision.reason, "highlighted-keyboard-selection");
    assert.equal(opened.length, 1);
    assert.equal(opened[0].graphic, highlighted);
    assert.equal(opened[0].location, highlighted.geometry.extent.center);
  }
});

test("keyboard direct selection does not select an arbitrary Product without a transient highlight", () => {
  const graphic = createGraphic("s57", "only");
  const opened = [];

  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ ctrlKey: true }),
    getInteractiveLayers: () => [graphic.layer],
    getHighlightedIdentity: () => null,
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(decision.type, "none");
  assert.deepEqual(opened, []);
});

test("a popup-locked Product cannot become the keyboard candidate when transient identity is absent", () => {
  const popupLocked = createGraphic("s57", "locked");
  const opened = [];

  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ metaKey: true }),
    getInteractiveLayers: () => [popupLocked.layer],
    getHighlightedIdentity: () => null,
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(decision.type, "none");
  assert.equal(opened.length, 0);
});

test("stale highlighted identity is rejected by keyboard activation", () => {
  const stale = createGraphic("s57", "stale");
  const current = createGraphic("s101", "current");
  const opened = [];

  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ ctrlKey: true }),
    getInteractiveLayers: () => [current.layer],
    getHighlightedIdentity: () => getIdentity(stale),
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(decision.type, "none");
  assert.equal(opened.length, 0);
});

test("a hidden highlighted Graphic is rejected by keyboard activation", () => {
  const highlighted = createGraphic("s57", "hidden-keyboard", { visible: false });
  const opened = [];

  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ ctrlKey: true }),
    getInteractiveLayers: () => [highlighted.layer],
    getHighlightedIdentity: () => getIdentity(highlighted),
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(decision.type, "none");
  assert.equal(opened.length, 0);
});

test("source or layer removal rejects keyboard activation", () => {
  const highlighted = createGraphic("s57", "removed-source");
  const opened = [];

  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ ctrlKey: true }),
    getInteractiveLayers: () => [],
    getHighlightedIdentity: () => getIdentity(highlighted),
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(decision.type, "none");
  assert.equal(opened.length, 0);
});

test("Graphic removal from a retained layer rejects keyboard activation", () => {
  const highlighted = createGraphic("s57", "removed-graphic");
  const opened = [];
  highlighted.layer._index.delete(highlighted.attributes.featureKey);
  highlighted.layer.graphics = [];

  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ ctrlKey: true }),
    getInteractiveLayers: () => [highlighted.layer],
    getHighlightedIdentity: () => getIdentity(highlighted),
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(decision.type, "none");
  assert.equal(opened.length, 0);
});

test("layer replacement never opens the stale Graphic and may resolve the current stable identity", () => {
  const stale = createGraphic("s57", "replacement");
  const replacementLayer = createLayer("s57");
  const replacement = createGraphic("s57", "replacement", { layer: replacementLayer });
  const opened = [];

  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ metaKey: true }),
    getInteractiveLayers: () => [replacementLayer],
    getHighlightedIdentity: () => getIdentity(stale),
    openGraphic: (options) => opened.push(options),
  });

  assert.notEqual(replacement, stale);
  assert.equal(decision.graphic, replacement);
  assert.equal(opened[0].graphic, replacement);
});

test("pointer and keyboard direct activation resolve the same stable current identity", () => {
  const stale = createGraphic("s57", "shared-path");
  const replacementLayer = createLayer("s57");
  const replacement = createGraphic("s57", "shared-path", { layer: replacementLayer });
  const pointerDecision = resolveProductClickDecision({
    event: createEvent({ ctrlKey: true }),
    graphics: [createGraphic("s101", "other"), replacement],
    highlightedIdentity: getIdentity(stale),
  });
  const opened = [];
  const keyboardDecision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ ctrlKey: true }),
    getInteractiveLayers: () => [replacementLayer],
    getHighlightedIdentity: () => getIdentity(stale),
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(pointerDecision.graphic, replacement);
  assert.equal(keyboardDecision.graphic, replacement);
  assert.equal(opened[0].graphic, replacement);
});

test("superseded or destroyed interaction generations cannot publish keyboard activation", () => {
  for (const retire of ["supersede", "destroy"]) {
    const session = createProductClickSession();
    const graphic = createGraphic("s57", retire);
    const isCurrent = session.begin();
    const opened = [];

    if (retire === "supersede") {
      session.begin();
    } else {
      session.destroy();
    }

    const decision = handleProductKeyboardActivation({
      event: createKeyboardEvent({ ctrlKey: true }),
      getInteractiveLayers: () => [graphic.layer],
      getHighlightedIdentity: () => getIdentity(graphic),
      openGraphic: (options) => opened.push(options),
      isCurrent,
    });

    assert.equal(decision.type, "none");
    assert.equal(opened.length, 0);
  }
});

test("keyboard activation supersedes an older in-flight pointer click through the shared session", async () => {
  const session = createProductClickSession();
  const pointerHit = createDeferred();
  const pointerInteraction = createInteraction({
    graphics: [createGraphic("s57", "pointer-old")],
    hitTestPromise: pointerHit.promise,
    isCurrent: session.begin(),
  });
  const pendingPointer = handleProductClick(pointerInteraction.options);
  const keyboardGraphic = createGraphic("s101", "keyboard-new");
  const keyboardOpened = [];

  const keyboardDecision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ metaKey: true }),
    getInteractiveLayers: () => [keyboardGraphic.layer],
    getHighlightedIdentity: () => getIdentity(keyboardGraphic),
    openGraphic: (options) => keyboardOpened.push(options),
    isCurrent: session.begin(),
  });
  pointerHit.resolve({ results: pointerInteraction.results });

  assert.equal(keyboardDecision.type, "graphic");
  assert.equal(keyboardOpened[0].graphic, keyboardGraphic);
  assert.equal((await pendingPointer).type, "stale");
  assert.equal(pointerInteraction.opened.length, 0);
});

test("keyboard binding is map-scoped, ignores repeat, and stops only handled activation", () => {
  const graphic = createGraphic("s57", "keyboard-binding");
  const view = createKeyboardView();
  const session = createProductClickSession();
  const opened = [];
  let beginCount = 0;
  const cleanup = bindProductKeyboardActivation({
    view,
    beginInteraction: () => {
      beginCount += 1;
      return session.begin();
    },
    getInteractiveLayers: () => [graphic.layer],
    getHighlightedIdentity: () => getIdentity(graphic),
    openGraphic: (options) => opened.push(options),
  });

  const plainEnter = createKeyboardEvent();
  view.emit("key-down", plainEnter);
  const repeated = createKeyboardEvent({ ctrlKey: true, repeat: true });
  view.emit("key-down", repeated);
  const handled = createKeyboardEvent({ ctrlKey: true });
  view.emit("key-down", handled);

  assert.equal(beginCount, 1);
  assert.equal(opened.length, 1);
  assert.equal(plainEnter.propagationStopped, false);
  assert.equal(repeated.propagationStopped, false);
  assert.equal(handled.propagationStopped, true);

  cleanup();
  view.emit("key-down", createKeyboardEvent({ ctrlKey: true }));
  assert.equal(opened.length, 1);
});

test("Shift+Ctrl/Cmd+Enter does not invoke direct keyboard activation", () => {
  const graphic = createGraphic("s57", "shift-keyboard");
  const opened = [];
  const decision = handleProductKeyboardActivation({
    event: createKeyboardEvent({ ctrlKey: true, shiftKey: true }),
    getInteractiveLayers: () => [graphic.layer],
    getHighlightedIdentity: () => getIdentity(graphic),
    openGraphic: (options) => opened.push(options),
  });

  assert.equal(decision.type, "ignored");
  assert.equal(opened.length, 0);
});

test("overlap-picker selection uses the same normal Product popup callback", async () => {
  const selected = createGraphic("s101", "B");
  const interaction = createInteraction({
    graphics: [createGraphic("s57", "A"), selected],
    selectFromOverlap: selected,
  });

  await handleProductClick(interaction.options);

  assert.equal(interaction.opened.length, 1);
  assert.equal(interaction.opened[0].graphic, selected);
  assert.equal(interaction.opened[0].location, interaction.options.event.mapPoint);
});

function createInteraction({
  event = createEvent(),
  graphics,
  highlightedIdentity = null,
  hitTestPromise,
  interactiveLayers = null,
  selectFromOverlap = null,
  isCurrent = () => true,
}) {
  const opened = [];
  const overlaps = [];
  const results = graphics.map((graphic) => ({ graphic }));
  const state = {
    opened,
    overlaps,
    results,
    hitTestOptions: null,
    closed: 0,
  };
  const readHighlightedIdentity =
    typeof highlightedIdentity === "function" ? highlightedIdentity : () => highlightedIdentity;
  const readInteractiveLayers =
    typeof interactiveLayers === "function"
      ? interactiveLayers
      : () => interactiveLayers ?? [...new Set(graphics.map((graphic) => graphic.layer))];

  state.options = {
    event,
    view: {
      async hitTest(_event, options) {
        state.hitTestOptions = options;
        return hitTestPromise ?? { results };
      },
    },
    getInteractiveLayers: readInteractiveLayers,
    getClickCandidates: getValidUniqueClickCandidates,
    getHighlightedIdentity: readHighlightedIdentity,
    openGraphic: (options) => opened.push(options),
    openOverlap: (options) => {
      overlaps.push(options);
      if (selectFromOverlap) {
        options.onSelect(selectFromOverlap);
      }
    },
    closePopup() {
      state.closed += 1;
    },
    isCurrent,
  };

  return state;
}

function createGraphic(
  sourceId,
  productKey,
  { visible = true, layerVisible = true, layer = createLayer(sourceId) } = {}
) {
  const layerId = `${sourceId}-products`;
  const featureKey = JSON.stringify([sourceId, productKey]);
  const graphic = {
    uid: `${sourceId}:${productKey}`,
    visible,
    attributes: {
      sourceId,
      featureKey,
      productIdentityKey: featureKey,
    },
    geometry: {
      type: "polygon",
      extent: {
        center: { x: productKey.length, y: sourceId.length },
      },
    },
    layer,
  };

  layer.customId ??= layerId;
  layer.appLayerId ??= layerId;
  layer.visible = layerVisible;
  layer._index ??= new Map();
  layer._index.set(featureKey, graphic);
  layer.graphics ??= [];
  layer.graphics.push(graphic);
  return graphic;
}

function createLayer(sourceId) {
  return {
    customId: `${sourceId}-products`,
    appLayerId: `${sourceId}-products`,
    visible: true,
    _index: new Map(),
    graphics: [],
  };
}

function createEvent(modifiers = {}) {
  return {
    mapPoint: { x: 1, y: 2 },
    native: {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...modifiers,
    },
  };
}

function createKeyboardEvent({
  key = "Enter",
  repeat = false,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
} = {}) {
  return {
    key,
    repeat,
    propagationStopped: false,
    native: {
      ctrlKey,
      metaKey,
      shiftKey,
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}

function createKeyboardView() {
  const handlers = new Map();

  return {
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
  };
}

function getIdentity(graphic) {
  return `product:${graphic.attributes.productIdentityKey}`;
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
