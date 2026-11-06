import assert from "node:assert/strict";
import test from "node:test";
import { createPackagePopupSnapshotSynchronization } from "./packagePopupSnapshot.js";
import { createPackagePopupBackendSynchronization } from "./packagePopupFreshness.js";
import { registerPopupRefreshHandler, refreshOpenProductPopup } from "./popupRefreshBridge.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";
import { reconcileSourceInteractions } from "../../dataSources/map/reconcileSourceInteractions.js";
import { createPopupProductMetadataColumns } from "./popupProductMetadata.js";

function harness() {
  const context = {
    sourceId: "s101",
    productKey: "PRIMARY",
    datasetName: "PRIMARY",
    workUnit: {
      kind: "package",
      primaryMemberKey: "s101",
      members: [
        { key: "s101", label: "S-101", exportStandard: "S100" },
        { key: "s57", label: "S-57", exportStandard: "S57" },
      ],
    },
  };
  const overlay = {
    byStandard: {
      S57: {
        standard: "S57",
        datasetName: "OTHER",
        edition: 8,
        update: 0,
        status: 15,
        validationArtifacts: [{ url: "/validation", fileName: "result.txt" }],
      },
    },
  };
  const attributes = (edition, status) => ({
    sourceId: "s101",
    productKey: "PRIMARY",
    datasetName: "PRIMARY",
    productIdentityKey: "s101:PRIMARY",
    status: 1,
    displayScale: edition,
    workUnitStatus: {
      workflowStatus: 1,
      members: [
        { key: "s101", status },
        { key: "s57", status: 11 },
      ],
    },
    workUnitMetadata: {
      members: {
        s101: { datasetName: "PRIMARY", edition, update: 0 },
        s57: { datasetName: "OTHER", edition: 7, update: 0 },
      },
    },
  });
  const layer = { visible: true, appSourceDefinition: {}, graphics: [] };
  const graphic = { layer, attributes: { ...attributes(1, 8), exportMetadata: overlay } };
  layer.graphics.push(graphic);
  let current = { ...graphic.attributes };
  let connected = true;
  let renders = 0;
  let reads = 0;
  let latestRefreshId = 0;
  const acceptedReads = [];
  let destroyedTimers = 0;
  let revision = "a";
  let detail = async () => ({ exportMetadata: overlay });
  let delayedBridge;
  let monitor;
  let sync;
  const snapshot = createPackagePopupSnapshotSynchronization({
    graphic,
    productContext: context,
    isConnected: () => connected,
    getAttributes: () => current,
    onSourcePublication: () => {
      latestRefreshId++;
    },
    publish: (value) => {
      current = value;
      renders++;
    },
    onInvalid: () => sync.stopRefreshingPopup(),
  });
  sync = createPackagePopupBackendSynchronization({
    datasetName: "PRIMARY",
    syncFromGraphic: snapshot.synchronize,
    registerPopupRefreshHandler: (options) => {
      delayedBridge = options.refresh;
      return registerPopupRefreshHandler(options);
    },
    refresh: async () => {
      reads++;
      const refreshId = ++latestRefreshId;
      const value = await detail();
      if (!snapshot.isCurrent() || refreshId !== latestRefreshId) {
        acceptedReads.push(false);
        return false;
      }
      acceptedReads.push(true);
      graphic.attributes = { ...graphic.attributes, ...value };
      current = { ...graphic.attributes };
      renders++;
      return true;
    },
    createFreshnessMonitor: (options) =>
      (monitor = createWorkspaceFreshnessMonitor({
        ...options,
        fetchFreshness: async () => [{ datasetName: "PRIMARY", available: true, revision }],
        documentRef: { addEventListener() {}, removeEventListener() {} },
        setIntervalFn: () => 1,
        clearIntervalFn: () => {
          destroyedTimers++;
        },
      })),
  });
  return {
    sync,
    graphic,
    layer,
    overlay,
    context,
    attributes,
    snapshot,
    state: () => ({ current, reads, renders, destroyedTimers, acceptedReads }),
    bridge: () => refreshOpenProductPopup("PRIMARY"),
    delayedBridge: () => delayedBridge(),
    disconnect: () => {
      connected = false;
      sync.stopRefreshingPopup();
    },
    setDetail: (fn) => {
      detail = fn;
    },
    setRevision: (value) => {
      revision = value;
    },
    check: () => monitor.check(),
  };
}

test("package bridge registers once, reconciles refreshed Graphic and preserves only read overlay", async () => {
  const h = harness();
  try {
    assert.equal(h.sync.stopWatchingActiveJobs, null);
    h.graphic.attributes = h.attributes(3, 11);
    assert.deepEqual(await h.bridge(), { matched: 1, refreshed: 1 });
    const { current, reads, renders } = h.state();
    assert.equal(reads, 0);
    assert.equal(renders, 1);
    assert.equal(current.workUnitMetadata, h.graphic.attributes.workUnitMetadata);
    assert.equal(current.workUnitStatus, h.graphic.attributes.workUnitStatus);
    assert.equal(current.displayScale, 3);
    assert.equal(current.exportMetadata, h.overlay);
    assert.equal(Object.hasOwn(h.graphic.attributes, "exportMetadata"), false);
    const columns = createPopupProductMetadataColumns(current, h.context);
    assert.equal(columns[0].item.edition, 3);
    assert.equal(columns[0].item.status, 11);
    assert.deepEqual(
      columns[1].item.validationArtifacts,
      h.overlay.byStandard.S57.validationArtifacts
    );
  } finally {
    h.disconnect();
  }
});

test("explicit refreshed overlay, including explicit removal, replaces preserved overlay", async () => {
  const h = harness();
  try {
    const replacement = { byStandard: {} };
    h.graphic.attributes = { ...h.attributes(3, 11), exportMetadata: replacement };
    await h.bridge();
    assert.equal(h.state().current.exportMetadata, replacement);
    h.graphic.attributes = { ...h.attributes(4, 15), exportMetadata: undefined };
    await h.bridge();
    assert.equal(h.state().current.exportMetadata, undefined);
  } finally {
    h.disconnect();
  }
});

test("actual stable-Graphic source reconciliation updates open snapshot without a detail request", async () => {
  const h = harness();
  try {
    h.graphic.attributes = h.attributes(3, 15);
    let notified;
    reconcileSourceInteractions({
      sourceId: "s101",
      layers: [h.layer],
      view: {
        popup: {
          visible: true,
          selectedFeature: h.graphic,
          open: () => assert.fail("Stable Graphic must remain selected"),
        },
      },
      refreshPopup: (...args) => (notified = refreshOpenProductPopup(...args)),
    });
    await notified;
    assert.equal(h.state().current.workUnitStatus.members[0].status, 15);
    assert.equal(h.state().reads, 0);
  } finally {
    h.disconnect();
  }
});

test("source bridge supersedes initial detail without duplicate simultaneous reads and permits recovery", async () => {
  const h = harness();
  try {
    let finish;
    let firstRead = true;
    h.setDetail(() => {
      if (!firstRead)
        return Promise.resolve({
          workUnitMetadata: h.attributes(3, 11).workUnitMetadata,
          exportMetadata: h.overlay,
        });
      firstRead = false;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const initial = h.sync.start();
    await new Promise((resolve) => setImmediate(resolve));
    h.graphic.attributes = h.attributes(3, 11);
    await h.bridge();
    assert.equal(h.state().reads, 1);
    assert.equal(h.state().current.workUnitMetadata.members.s101.edition, 3);
    finish({
      workUnitMetadata: h.attributes(2, 8).workUnitMetadata,
      exportMetadata: { byStandard: {} },
    });
    await initial;
    assert.deepEqual(h.state().acceptedReads, [false, true]);
    assert.equal(h.state().current.workUnitMetadata.members.s101.edition, 3);
    await h.check();
    assert.equal(h.state().reads, 2);
    const replacement = { byStandard: {} };
    h.setDetail(async () => ({ exportMetadata: replacement }));
    h.setRevision("b");
    await h.check();
    assert.equal(h.state().current.exportMetadata, replacement);
    assert.equal(h.state().reads, 3);
  } finally {
    h.disconnect();
  }
});

test("disconnect unregisters bridge, destroys timer and rejects delayed callback", async () => {
  const h = harness();
  await h.sync.start();
  const renders = h.state().renders;
  h.disconnect();
  assert.deepEqual(await h.bridge(), { matched: 0, refreshed: 0 });
  assert.equal(h.delayedBridge(), false);
  assert.equal(h.state().renders, renders);
  assert.ok(h.state().destroyedTimers >= 1);
});

for (const [name, invalidate] of [
  [
    "layer replacement",
    (h) => {
      h.graphic.layer = { ...h.layer };
    },
  ],
  [
    "source replacement",
    (h) => {
      h.layer.appSourceDefinition = {};
    },
  ],
  [
    "source deactivation",
    (h) => {
      h.layer.visible = false;
    },
  ],
  [
    "dataset switch",
    (h) => {
      h.graphic.attributes.datasetName = "OTHER";
    },
  ],
  [
    "source identity switch",
    (h) => {
      h.graphic.attributes.sourceId = "s102";
    },
  ],
  [
    "Product switch",
    (h) => {
      h.graphic.attributes.productKey = "OTHER";
    },
  ],
  [
    "stable identity switch",
    (h) => {
      h.graphic.attributes.productIdentityKey = "OTHER";
    },
  ],
  [
    "Graphic removal",
    (h) => {
      h.layer.graphics = [];
    },
  ],
]) {
  test(`delayed source bridge fails closed after ${name}`, async () => {
    const h = harness();
    try {
      invalidate(h);
      assert.equal(h.delayedBridge(), false);
      assert.equal(h.state().renders, 0);
      assert.deepEqual(await h.bridge(), { matched: 0, refreshed: 0 });
    } finally {
      h.disconnect();
    }
  });
}

test("newer source publication rejects entire realistic freshness detail and leaves revision retryable", async () => {
  const h = harness();
  try {
    await h.sync.start();
    assert.equal(h.state().current.workUnitMetadata.members.s101.edition, 1);
    let finish;
    h.setRevision("b");
    h.setDetail(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const oldRead = h.check();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.state().reads, 2);
    h.graphic.attributes = h.attributes(3, 11);
    assert.deepEqual(await h.bridge(), { matched: 1, refreshed: 1 });
    assert.equal(h.state().current.workUnitMetadata.members.s101.edition, 3);
    assert.equal(h.state().reads, 2);
    const staleOverlay = {
      byStandard: {
        S57: { datasetName: "OTHER", edition: 2, validationArtifacts: [{ url: "/stale" }] },
      },
    };
    finish({ workUnitMetadata: h.attributes(2, 8).workUnitMetadata, exportMetadata: staleOverlay });
    assert.equal(await oldRead, false);
    assert.equal(h.state().current.workUnitMetadata.members.s101.edition, 3);
    assert.equal(h.graphic.attributes.workUnitMetadata.members.s101.edition, 3);
    assert.equal(h.state().current.exportMetadata, h.overlay);
    assert.notEqual(h.graphic.attributes.exportMetadata, staleOverlay);
    assert.deepEqual(h.state().acceptedReads, [true, false]);
    const nextOverlay = { byStandard: {} };
    h.setDetail(async () => ({
      workUnitMetadata: h.attributes(4, 11).workUnitMetadata,
      exportMetadata: nextOverlay,
    }));
    assert.equal(await h.check(), true);
    assert.equal(h.state().reads, 3);
    assert.equal(h.state().current.workUnitMetadata.members.s101.edition, 4);
    assert.equal(h.state().current.exportMetadata, nextOverlay);
    await h.check();
    assert.equal(h.state().reads, 3);
  } finally {
    h.disconnect();
  }
});

test("invalid source callback never advances publication generation", () => {
  let publications = 0;
  const sync = createPackagePopupSnapshotSynchronization({
    graphic: { attributes: {} },
    productContext: {},
    isConnected: () => false,
    getAttributes: () => ({}),
    publish: () => assert.fail("Invalid source publication"),
    onSourcePublication: () => {
      publications++;
    },
  });
  assert.equal(sync.synchronize(), false);
  assert.equal(publications, 0);
});
