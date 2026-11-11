import { createPackageActionSession } from "../../map/popups/packageActionSession.js";
import { createPopupWorkflowActions } from "../../map/popups/popupWorkflowActions.js";
import { confirmAction } from "../../../shared/ui/confirm/services/confirmService.js";
import { noticeWarning } from "../../notices/services/noticeService.js";
import { resolveProductContext } from "../../products/domain/productContext.js";

/**
 * Analyze owns these sessions independently of the Main Map popup. Only a
 * source-resolved, active Package with matching member identities may start
 * a backend action read; a UI control never grants its own permission.
 */
export function createAnalyzePackageActions({
  getProduct,
  getProducts = () => [],
  isCurrentGraphicLayer = () => false,
  isEnabled,
  refreshProduct,
  onChange = () => {},
  createSession = createPackageActionSession,
  confirmDiscard = confirmAction,
  warn = noticeWarning,
} = {}) {
  const sessions = new Map();
  const listeners = new Set();
  let destroyed = false;
  function notify() {
    if (destroyed) return;
    onChange();
    for (const listener of listeners) listener();
  }

  function subscribe(listener) {
    if (destroyed || typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function isEntryCurrent(entry) {
    return (
      !destroyed &&
      sessions.get(entry.key) === entry &&
      getProduct?.(entry.key) === entry.product &&
      isEnabled?.(entry.product) === true &&
      resolvePackageIdentity(entry.product)?.active === true
    );
  }

  function reconcile(products, enabledNames) {
    if (destroyed) return;
    const enabled = new Set(enabledNames.map(normalizeName));
    const current = new Map();
    let changed = false;
    for (const product of products) {
      const identity = resolvePackageIdentity(product);
      if (!identity || !enabled.has(normalizeName(product.datasetName))) continue;
      current.set(identity.key, { product, identity });
    }
    for (const [key, entry] of sessions) {
      const next = current.get(key);
      if (next?.product !== entry.product || next.identity.active !== true) {
        sessions.delete(key);
        entry.session.destroy();
        changed = true;
      }
    }
    for (const [key, { product, identity }] of current) {
      if (identity.active !== true || sessions.has(key)) continue;
      const entry = { key, product, session: null };
      entry.session = createSession({
        sourceName: identity.sourceName,
        identityKey: identity.productIdentityKey,
        memberNames: identity.memberNames,
        hasActivePackage: () => isEntryCurrent(entry),
        isCurrent: () => isEntryCurrent(entry),
        onChange: () => {
          if (isEntryCurrent(entry)) notify();
        },
        // Refresh after invoke() returns so the successful server result can
        // publish its notice before Analyze replaces the accepted Product.
        onDiscardSucceeded: () => true,
      });
      sessions.set(key, entry);
      changed = true;
      void entry.session.start();
    }
    if (changed) notify();
  }

  function actionsFor(product) {
    const identity = resolvePackageIdentity(product);
    if (!identity) {
      return createPopupWorkflowActions({ subject: "product" });
    }
    const entry = sessions.get(identity.key);
    const current = entry?.product === product && isEntryCurrent(entry);
    const projection = current ? entry.session.projection() : null;
    const verified =
      projection?.verified === true &&
      projection.identityKey === identity.productIdentityKey &&
      projection.liveVerified === true;
    const actions = createPopupWorkflowActions({
      paused: verified && projection.paused === true,
      primaryAction: verified ? projection.primaryAction : "send",
      eligibleMembers: verified ? projection.eligibleMembers : null,
      actionEligibility: verified ? projection.actionEligibility : null,
      subject: "package",
    });
    for (const action of actions) {
      const authorized = verified && projection.actionEligibility?.[action.operation] === true;
      action.disabled = !authorized;
      action.disabledReason = authorized
        ? null
        : identity.active !== true
          ? "No active package actions are available for this Product."
          : "This package action is not available right now.";
      action.controlKind = authorized ? "live-package" : "unavailable-package";
      action.onClick = ({ anchorElement } = {}) => invoke(entry, action.operation, anchorElement);
    }
    return actions;
  }

  function actionsForGraphic(graphic) {
    const product = resolveGraphicProduct(graphic);
    if (!product) return [];
    return actionsFor(product).map((action) => ({
      ...action,
      isCurrent: () => resolveGraphicProduct(graphic) === product,
    }));
  }

  function resolveGraphicProduct(graphic) {
    const layer = graphic?.layer;
    if (
      !layer ||
      !isCurrentGraphicLayer(layer) ||
      layer.visible === false ||
      graphic.visible === false
    )
      return null;
    const graphics = layer.graphics?.toArray?.() ?? layer.graphics;
    if (!graphics || !Array.from(graphics).includes(graphic)) return null;
    const context = resolveProductContext({ graphic });
    if (!context?.identityKey || graphic.attributes?.productIdentityKey !== context.identityKey)
      return null;
    const matching = getProducts().filter(
      (product) =>
        product.workspaceLoadState === "loaded" &&
        product.productContext?.identityKey === context.identityKey &&
        product.productContext?.sourceId === context.sourceId &&
        product.datasetName === context.datasetName &&
        isEnabled?.(product) === true &&
        (product.workUnit?.kind === "package"
          ? product.workUnit.identityKey === layer.appAnalyzeWorkUnitKey
          : !layer.appAnalyzeWorkUnitKey)
    );
    return matching.length === 1 ? matching[0] : null;
  }

  async function invoke(entry, operation, anchorElement) {
    if (!entry || !isEntryCurrent(entry) || (anchorElement && !anchorElement.isConnected))
      return false;
    if (operation === "discard") {
      const confirmed = await confirmDiscard({
        title: "Discard package?",
        message: "Discard the S-101 and S-57 package candidates? This cannot be undone.",
        confirmText: "Discard",
        anchorElement,
      });
      if (!confirmed) return false;
    }
    // Awaiting confirmation may outlive a route transition, selection edit or
    // a newer backend projection; revalidate all three before dispatch.
    if (
      !isEntryCurrent(entry) ||
      (anchorElement && !anchorElement.isConnected) ||
      entry.session.projection()?.actionEligibility?.[operation] !== true
    )
      return false;
    const succeeded = await entry.session.invoke(operation);
    if (!succeeded || !isEntryCurrent(entry)) return succeeded;
    if (["pause", "resume", "discard"].includes(operation)) {
      const refreshed = await refreshProduct?.(entry.product.datasetName);
      if (refreshed === false && !destroyed) {
        warn("Analyze refresh pending", "Refresh Analyze to see the latest package state.");
      }
    }
    return true;
  }

  function destroy() {
    destroyed = true;
    for (const entry of sessions.values()) entry.session.destroy();
    sessions.clear();
    listeners.clear();
  }

  return { reconcile, actionsFor, actionsForGraphic, subscribe, destroy };
}

export function resolvePackageIdentity(product) {
  const unit = product?.workUnit;
  const context = product?.productContext;
  if (
    product?.workspaceLoadState !== "loaded" ||
    unit?.kind !== "package" ||
    !unit.identityKey ||
    !context?.identityKey ||
    !context?.datasetName ||
    context.workUnit?.kind !== "package" ||
    !Array.isArray(unit.members) ||
    !Array.isArray(product.members) ||
    unit.members.length < 2 ||
    unit.members.length !== product.members.length
  )
    return null;
  const memberNames = {};
  const seen = new Set();
  for (const member of unit.members) {
    const resolved = product.members.find((item) => item.memberKey === member.key);
    if (
      !member.key ||
      seen.has(member.key) ||
      !resolved ||
      normalizeName(resolved.datasetName) !== normalizeName(member.datasetName) ||
      !member.sourceId ||
      !member.exportStandard ||
      resolved.productContext?.sourceId !== member.sourceId
    )
      return null;
    seen.add(member.key);
    memberNames[member.key] = member.datasetName;
  }
  const primary = unit.members.find((member) => member.key === unit.primaryMemberKey);
  if (
    !primary ||
    context.sourceId !== primary.sourceId ||
    normalizeName(primary.datasetName) !== normalizeName(context.datasetName) ||
    normalizeName(primary.datasetName) !== normalizeName(product.datasetName)
  )
    return null;
  const attributes = context.data?.attributes;
  const backendMembers = attributes?.workUnitMetadata?.members;
  if (
    backendMembers &&
    unit.members.some(
      (member) =>
        normalizeName(backendMembers[member.key]?.datasetName) !== normalizeName(member.datasetName)
    )
  )
    return null;
  return {
    key: unit.identityKey,
    productIdentityKey: context.identityKey,
    sourceName: context.datasetName,
    memberNames,
    active: attributes?.hasActivePackage === true,
  };
}

function normalizeName(name) {
  return String(name ?? "")
    .trim()
    .toUpperCase();
}
